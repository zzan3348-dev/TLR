import type {
  ImagePoint,
  MapCountryComponent,
} from "../types/mapCountry";
import { modulo } from "./mapCameraUtils";

export function decodeMapId(
  red: number,
  green: number,
  blue: number,
): number {
  return red + (green << 8) + (blue << 16);
}

export function readDominantMapId(
  context: CanvasRenderingContext2D,
  point: ImagePoint,
  imageSize: { width: number; height: number },
  radius = 2,
): number {
  const startX = Math.max(0, Math.floor(point.x) - radius);
  const startY = Math.max(0, Math.floor(point.y) - radius);
  const endX = Math.min(imageSize.width - 1, Math.floor(point.x) + radius);
  const endY = Math.min(imageSize.height - 1, Math.floor(point.y) + radius);
  const width = endX - startX + 1;
  const height = endY - startY + 1;
  const pixels = context.getImageData(startX, startY, width, height).data;
  const counts = new Map<number, { count: number; centerDistance: number }>();

  for (let index = 0; index < pixels.length; index += 4) {
    const id = decodeMapId(
      pixels[index],
      pixels[index + 1],
      pixels[index + 2],
    );
    if (id === 0) {
      continue;
    }
    const pixelIndex = index / 4;
    const localX = pixelIndex % width;
    const localY = Math.floor(pixelIndex / width);
    const centerDistance = Math.hypot(
      startX + localX - point.x,
      startY + localY - point.y,
    );
    const existing = counts.get(id);
    if (existing) {
      existing.count += 1;
      existing.centerDistance = Math.min(
        existing.centerDistance,
        centerDistance,
      );
    } else {
      counts.set(id, { count: 1, centerDistance });
    }
  }

  return (
    [...counts.entries()].sort(
      ([firstId, first], [secondId, second]) =>
        second.count - first.count ||
        first.centerDistance - second.centerDistance ||
        firstId - secondId,
    )[0]?.[0] ?? 0
  );
}

export function pointInWrappedBounds(
  point: ImagePoint,
  component: MapCountryComponent,
  mapWidth: number,
): boolean {
  const relativeX = modulo(point.x - component.bounds.x, mapWidth);
  return (
    relativeX < component.bounds.width &&
    point.y >= component.bounds.y &&
    point.y < component.bounds.y + component.bounds.height
  );
}

export function findComponentForPoint(
  countryId: number,
  point: ImagePoint,
  components: readonly MapCountryComponent[],
  mapWidth: number,
): MapCountryComponent | null {
  const containing = components
    .filter(
      (component) =>
        component.countryId === countryId &&
        pointInWrappedBounds(point, component, mapWidth),
    )
    .sort(
      (first, second) =>
        first.bounds.width * first.bounds.height -
        second.bounds.width * second.bounds.height,
    );

  if (containing[0]) {
    return containing[0];
  }

  return (
    components
      .filter((component) => component.countryId === countryId)
      .sort((first, second) => {
        const firstDeltaX = Math.min(
          Math.abs(point.x - modulo(first.centroid.x, mapWidth)),
          mapWidth - Math.abs(point.x - modulo(first.centroid.x, mapWidth)),
        );
        const secondDeltaX = Math.min(
          Math.abs(point.x - modulo(second.centroid.x, mapWidth)),
          mapWidth - Math.abs(point.x - modulo(second.centroid.x, mapWidth)),
        );
        return (
          Math.hypot(firstDeltaX, point.y - first.centroid.y) -
          Math.hypot(secondDeltaX, point.y - second.centroid.y)
        );
      })[0] ?? null
  );
}
