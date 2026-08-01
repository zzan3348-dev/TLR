import {
  getFaction,
  NON_ALIGNED_COLOR,
} from "../data/factions";
import type { MapCountryIndex } from "../types/mapCountry";
import type { MapCountryLabel } from "../types/mapCountry";

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

function hexToRgb(hex: string): RgbColor {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(color: RgbColor): string {
  return `#${[color.r, color.g, color.b]
    .map((channel) =>
      Math.round(channel).toString(16).padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

export function mixColors(
  baseColor: string,
  mixedColor: string,
  mixedColorRatio: number,
): string {
  const ratio = Math.max(0, Math.min(1, mixedColorRatio));
  const base = hexToRgb(baseColor);
  const mixed = hexToRgb(mixedColor);
  return rgbToHex({
    r: base.r * (1 - ratio) + mixed.r * ratio,
    g: base.g * (1 - ratio) + mixed.g * ratio,
    b: base.b * (1 - ratio) + mixed.b * ratio,
  });
}

export function getObserverColor(baseColor: string): string {
  return mixColors(baseColor, NON_ALIGNED_COLOR, 0.35);
}

export function resolveFactionMapColor(
  country: MapCountryIndex | null | undefined,
): string {
  const membership = country?.factionMembership;
  if (!membership || membership.status !== "member") {
    return NON_ALIGNED_COLOR;
  }
  const faction = getFaction(membership.factionId);
  if (!faction) {
    return NON_ALIGNED_COLOR;
  }
  return faction.color;
}

export function getFactionMembershipLabel(
  country: MapCountryIndex,
): string {
  const membership = country.factionMembership;
  if (!membership || membership.status !== "member") {
    return "비동맹";
  }
  const faction = getFaction(membership.factionId);
  if (!faction) {
    return "비동맹";
  }
  return faction.name;
}

export function createFactionMapLabels(
  labels: readonly MapCountryLabel[],
  countries: readonly MapCountryIndex[],
  mapWidth: number,
): MapCountryLabel[] {
  const countriesById = new Map(
    countries.map((country) => [country.id, country]),
  );
  const candidatesByFactionId = new Map<
    string,
    MapCountryLabel[]
  >();

  for (const label of labels) {
    const country = countriesById.get(label.countryId);
    const membership = country?.factionMembership;
    if (
      !membership ||
      membership.status !== "member" ||
      !getFaction(membership.factionId)
    ) {
      continue;
    }
    const candidates =
      candidatesByFactionId.get(membership.factionId) ?? [];
    candidates.push(label);
    candidatesByFactionId.set(membership.factionId, candidates);
  }

  const minimumLabelDistance = 360;
  const distanceBetweenLabels = (
    first: MapCountryLabel,
    second: MapCountryLabel,
  ) => {
    const firstX = ((first.x % mapWidth) + mapWidth) % mapWidth;
    const secondX = ((second.x % mapWidth) + mapWidth) % mapWidth;
    const directX = Math.abs(firstX - secondX);
    const wrappedX = Math.min(directX, mapWidth - directX);
    return Math.hypot(wrappedX, first.y - second.y);
  };

  return [...candidatesByFactionId.entries()].flatMap(
    ([factionId, candidates]) => {
      const faction = getFaction(factionId);
      if (!faction || candidates.length === 0) {
        return [];
      }

      const sortedCandidates = [...candidates].sort(
        (first, second) =>
          second.groupPixelCount - first.groupPixelCount ||
          second.priority - first.priority,
      );
      const chosen: MapCountryLabel[] = [sortedCandidates[0]];
      for (const candidate of sortedCandidates.slice(1)) {
        if (chosen.length >= faction.mapLabelCount) {
          break;
        }
        if (
          chosen.every(
            (current) =>
              distanceBetweenLabels(current, candidate) >=
              minimumLabelDistance,
          )
        ) {
          chosen.push(candidate);
        }
      }

      const totalFactionArea = candidates.reduce(
        (sum, candidate) => sum + candidate.groupPixelCount,
        0,
      );
      return chosen.map((label, index) => {
        const path =
          faction.mapLabelPaths?.[index] ??
          (index === 0 ? faction.primaryMapLabelPath : undefined);
        const start = path?.start ?? label.start;
        const control = path?.control ?? label.control;
        const end = path?.end ?? label.end;
        return {
          ...label,
          text: faction.name,
          start,
          control,
          end,
          x: (start.x + 2 * control.x + end.x) / 4,
          y: (start.y + 2 * control.y + end.y) / 4,
          fontSize: path?.fontSize ?? label.fontSize,
          letterSpacing:
            path?.letterSpacing ?? label.letterSpacing,
          maxWidth: path
            ? Math.hypot(end.x - start.x, end.y - start.y)
            : label.maxWidth,
          groupPixelCount:
            index === 0 ? totalFactionArea : label.groupPixelCount,
          visible: true,
          hiddenReason: null,
          minZoom: 0,
          priority: Math.max(100, label.priority),
        };
      });
    },
  );
}

export function createFactionMapLayer(
  politicalFill: CanvasImageSource,
  idMapContext: CanvasRenderingContext2D,
  imageSize: { width: number; height: number },
  countries: readonly MapCountryIndex[],
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = imageSize.width;
  canvas.height = imageSize.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("세력지도 Canvas를 초기화할 수 없습니다.");
  }

  context.drawImage(
    politicalFill,
    0,
    0,
    imageSize.width,
    imageSize.height,
  );
  const output = context.getImageData(
    0,
    0,
    imageSize.width,
    imageSize.height,
  );
  const ids = idMapContext.getImageData(
    0,
    0,
    imageSize.width,
    imageSize.height,
  ).data;
  const colorsByCountryId = new Map(
    countries.map((country) => [
      country.id,
      hexToRgb(resolveFactionMapColor(country)),
    ]),
  );

  for (let index = 0; index < ids.length; index += 4) {
    const countryId =
      ids[index] + (ids[index + 1] << 8) + (ids[index + 2] << 16);
    if (countryId === 0) {
      continue;
    }
    const color = colorsByCountryId.get(countryId);
    if (!color) {
      continue;
    }
    output.data[index] = color.r;
    output.data[index + 1] = color.g;
    output.data[index + 2] = color.b;
  }

  context.putImageData(output, 0, 0);
  return canvas;
}
