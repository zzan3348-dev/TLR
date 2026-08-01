import type {
  ImagePoint,
  MapCountryIndex,
  RgbaColor,
} from "../types/mapCountry";

export const MAP_SEA_COLOR: RgbaColor = {
  r: 10,
  g: 24,
  b: 40,
  a: 255,
};

const SEA_TOLERANCE = 14;
const DOMINANT_CLUSTER_TOLERANCE = 5;
export const COUNTRY_MATCH_TOLERANCE = 14;

export function colorDistance(
  first: Pick<RgbaColor, "r" | "g" | "b">,
  second: Pick<RgbaColor, "r" | "g" | "b">,
): number {
  return Math.hypot(
    first.r - second.r,
    first.g - second.g,
    first.b - second.b,
  );
}

export function rgbToHex(
  color: Pick<RgbaColor, "r" | "g" | "b">,
): string {
  return `#${[color.r, color.g, color.b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

export function hexToRgb(hex: string): RgbaColor | null {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);

  if (!match) {
    return null;
  }

  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16),
    a: 255,
  };
}

export function isExcludedMapColor(color: RgbaColor): boolean {
  if (color.a <= 10) {
    return true;
  }

  const isDarkBorder = color.r <= 35 && color.g <= 35 && color.b <= 35;
  const isNearWhite = color.r >= 235 && color.g >= 235 && color.b >= 235;
  const isSea = colorDistance(color, MAP_SEA_COLOR) <= SEA_TOLERANCE;

  return isDarkBorder || isNearWhite || isSea;
}

export function screenPointToImagePoint(
  screenPoint: ImagePoint,
  viewportSize: { width: number; height: number },
  imageSize: { width: number; height: number },
): ImagePoint | null {
  if (
    viewportSize.width <= 0 ||
    viewportSize.height <= 0 ||
    imageSize.width <= 0 ||
    imageSize.height <= 0
  ) {
    return null;
  }

  const scale = Math.min(
    viewportSize.width / imageSize.width,
    viewportSize.height / imageSize.height,
  );
  const renderedWidth = imageSize.width * scale;
  const renderedHeight = imageSize.height * scale;
  const offsetX = (viewportSize.width - renderedWidth) / 2;
  const offsetY = (viewportSize.height - renderedHeight) / 2;

  if (
    screenPoint.x < offsetX ||
    screenPoint.x >= offsetX + renderedWidth ||
    screenPoint.y < offsetY ||
    screenPoint.y >= offsetY + renderedHeight
  ) {
    return null;
  }

  return {
    x: Math.min(
      imageSize.width - 1,
      Math.floor((screenPoint.x - offsetX) / scale),
    ),
    y: Math.min(
      imageSize.height - 1,
      Math.floor((screenPoint.y - offsetY) / scale),
    ),
  };
}

type ColorGroup = {
  representative: RgbaColor;
  count: number;
  centerDistance: number;
};

export function readDominantMapColor(
  context: CanvasRenderingContext2D,
  point: ImagePoint,
  imageSize: { width: number; height: number },
  radius = 2,
): RgbaColor | null {
  const startX = Math.max(0, point.x - radius);
  const startY = Math.max(0, point.y - radius);
  const endX = Math.min(imageSize.width - 1, point.x + radius);
  const endY = Math.min(imageSize.height - 1, point.y + radius);
  const width = endX - startX + 1;
  const height = endY - startY + 1;
  const pixels = context.getImageData(startX, startY, width, height).data;
  const groups: ColorGroup[] = [];

  for (let index = 0; index < pixels.length; index += 4) {
    const color: RgbaColor = {
      r: pixels[index],
      g: pixels[index + 1],
      b: pixels[index + 2],
      a: pixels[index + 3],
    };

    if (isExcludedMapColor(color)) {
      continue;
    }

    const pixelIndex = index / 4;
    const localX = pixelIndex % width;
    const localY = Math.floor(pixelIndex / width);
    const distanceToCenter = Math.hypot(
      startX + localX - point.x,
      startY + localY - point.y,
    );
    const group = groups.find(
      (candidate) =>
        colorDistance(candidate.representative, color) <=
        DOMINANT_CLUSTER_TOLERANCE,
    );

    if (group) {
      group.count += 1;
      group.centerDistance = Math.min(group.centerDistance, distanceToCenter);
    } else {
      groups.push({
        representative: color,
        count: 1,
        centerDistance: distanceToCenter,
      });
    }
  }

  groups.sort(
    (first, second) =>
      second.count - first.count ||
      first.centerDistance - second.centerDistance ||
      rgbToHex(first.representative).localeCompare(
        rgbToHex(second.representative),
      ),
  );

  return groups[0]?.representative ?? null;
}

export function findNearestCountry(
  color: RgbaColor,
  countries: readonly MapCountryIndex[],
  tolerance = COUNTRY_MATCH_TOLERANCE,
): MapCountryIndex | null {
  let closest: MapCountryIndex | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const country of countries) {
    const countryColor = hexToRgb(country.color);

    if (!countryColor) {
      continue;
    }

    const distance = colorDistance(color, countryColor);

    if (distance < closestDistance) {
      closest = country;
      closestDistance = distance;
    }
  }

  return closestDistance <= tolerance ? closest : null;
}
