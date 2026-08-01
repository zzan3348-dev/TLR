import type {
  ImagePoint,
  MapCamera,
  ViewportSize,
} from "../types/mapCountry";

export const MAX_ZOOM_MULTIPLIER = 8;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function getFitScale(
  viewport: ViewportSize,
  imageSize: ViewportSize,
): number {
  if (
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    imageSize.width <= 0 ||
    imageSize.height <= 0
  ) {
    return 1;
  }
  return Math.min(
    viewport.width / imageSize.width,
    viewport.height / imageSize.height,
  );
}

export function normalizeCamera(
  camera: MapCamera,
  viewport: ViewportSize,
  imageSize: ViewportSize,
  fitScale: number,
): MapCamera {
  const scale = clamp(
    camera.scale,
    fitScale,
    fitScale * MAX_ZOOM_MULTIPLIER,
  );
  const visibleWorldHeight = viewport.height / scale;
  const y =
    visibleWorldHeight >= imageSize.height
      ? imageSize.height / 2
      : clamp(
          camera.y,
          visibleWorldHeight / 2,
          imageSize.height - visibleWorldHeight / 2,
        );

  return {
    x: modulo(camera.x, imageSize.width),
    y,
    scale,
  };
}

export function screenPointToWorldPoint(
  screenPoint: ImagePoint,
  camera: MapCamera,
  viewport: ViewportSize,
  imageSize: ViewportSize,
): ImagePoint | null {
  const worldY =
    camera.y + (screenPoint.y - viewport.height / 2) / camera.scale;
  if (worldY < 0 || worldY >= imageSize.height) {
    return null;
  }

  return {
    x: modulo(
      camera.x + (screenPoint.x - viewport.width / 2) / camera.scale,
      imageSize.width,
    ),
    y: worldY,
  };
}

export function zoomCameraAtPoint(
  camera: MapCamera,
  screenPoint: ImagePoint,
  targetScale: number,
  viewport: ViewportSize,
  imageSize: ViewportSize,
  fitScale: number,
): MapCamera {
  const anchorX =
    camera.x + (screenPoint.x - viewport.width / 2) / camera.scale;
  const anchorY =
    camera.y + (screenPoint.y - viewport.height / 2) / camera.scale;
  const scale = clamp(
    targetScale,
    fitScale,
    fitScale * MAX_ZOOM_MULTIPLIER,
  );

  return normalizeCamera(
    {
      x: anchorX - (screenPoint.x - viewport.width / 2) / scale,
      y: anchorY - (screenPoint.y - viewport.height / 2) / scale,
      scale,
    },
    viewport,
    imageSize,
    fitScale,
  );
}

export function cameraForWorldAnchor(
  anchorWorld: ImagePoint,
  screenPoint: ImagePoint,
  targetScale: number,
  viewport: ViewportSize,
  imageSize: ViewportSize,
  fitScale: number,
): MapCamera {
  return normalizeCamera(
    {
      x: anchorWorld.x - (screenPoint.x - viewport.width / 2) / targetScale,
      y: anchorWorld.y - (screenPoint.y - viewport.height / 2) / targetScale,
      scale: targetScale,
    },
    viewport,
    imageSize,
    fitScale,
  );
}

export function shortestWrappedDelta(
  from: number,
  to: number,
  width: number,
): number {
  return modulo(to - from + width / 2, width) - width / 2;
}
