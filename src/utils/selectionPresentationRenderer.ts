import type {
  MapCountryComponent,
  MapCountryIndex,
  ViewportSize,
} from "../types/mapCountry";
import { mapTheme } from "../data/mapTheme";

export const selectionPresentationConfig = {
  dimOpacity: 0.5,
  brightness: 0.54,
  saturation: 0.48,
  contrast: 0.88,
  fallbackOpacity: 0.16,
  rimOpacity: 0.68,
  fadeInDuration: 240,
  fadeOutDuration: 210,
} as const;

const territoryLayerCache = new Map<string, HTMLCanvasElement>();
const fallbackCache = new Map<string, HTMLCanvasElement>();
const rimCache = new Map<string, HTMLCanvasElement>();

function createComponentCanvas(
  component: MapCountryComponent,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = component.bounds.width;
  canvas.height = component.bounds.height;
  return canvas;
}

function drawWrappedCrop(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  component: MapCountryComponent,
): void {
  const sourceWidth =
    source instanceof HTMLImageElement
      ? source.naturalWidth
      : source instanceof HTMLCanvasElement
        ? source.width
        : component.bounds.width;
  const { x, y, width, height } = component.bounds;
  const firstWidth = Math.min(width, sourceWidth - x);
  if (firstWidth > 0) {
    context.drawImage(
      source,
      x,
      y,
      firstWidth,
      height,
      0,
      0,
      firstWidth,
      height,
    );
  }
  const remainingWidth = width - firstWidth;
  if (remainingWidth > 0) {
    context.drawImage(
      source,
      0,
      y,
      remainingWidth,
      height,
      firstWidth,
      0,
      remainingWidth,
      height,
    );
  }
}

export function getMaskedTerritoryLayer(
  source: CanvasImageSource,
  component: MapCountryComponent,
  mask: HTMLImageElement,
  cacheNamespace: string,
): HTMLCanvasElement | null {
  const cacheKey = `${cacheNamespace}:${component.componentId}`;
  const cached = territoryLayerCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const canvas = createComponentCanvas(component);
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  drawWrappedCrop(context, source, component);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(mask, 0, 0, canvas.width, canvas.height);
  territoryLayerCache.set(cacheKey, canvas);
  return canvas;
}

export function getFallbackTerritoryOverlay(
  component: MapCountryComponent,
  mask: HTMLImageElement,
): HTMLCanvasElement | null {
  const cached = fallbackCache.get(component.componentId);
  if (cached) {
    return cached;
  }
  const canvas = createComponentCanvas(component);
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const gradient = context.createLinearGradient(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  gradient.addColorStop(0, "rgba(233, 239, 232, 0.3)");
  gradient.addColorStop(0.48, "rgba(115, 151, 156, 0.12)");
  gradient.addColorStop(1, "rgba(238, 226, 191, 0.26)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const stripeSpacing = Math.max(
    16,
    Math.min(34, Math.round(Math.min(canvas.width, canvas.height) / 14)),
  );
  context.strokeStyle = "rgba(241, 239, 218, 0.12)";
  context.lineWidth = Math.max(2, stripeSpacing * 0.12);
  for (
    let offset = -canvas.height;
    offset < canvas.width + canvas.height;
    offset += stripeSpacing
  ) {
    context.beginPath();
    context.moveTo(offset, canvas.height);
    context.lineTo(offset + canvas.height, 0);
    context.stroke();
  }

  context.globalCompositeOperation = "destination-in";
  context.drawImage(mask, 0, 0, canvas.width, canvas.height);
  fallbackCache.set(component.componentId, canvas);
  return canvas;
}

export function getSelectedGroupRim(
  component: MapCountryComponent,
  mask: HTMLImageElement,
): HTMLCanvasElement | null {
  const cached = rimCache.get(component.componentId);
  if (cached) {
    return cached;
  }
  const maskCanvas = createComponentCanvas(component);
  const maskContext = maskCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!maskContext) {
    return null;
  }
  maskContext.drawImage(mask, 0, 0, maskCanvas.width, maskCanvas.height);
  const maskData = maskContext.getImageData(
    0,
    0,
    maskCanvas.width,
    maskCanvas.height,
  );
  const rimCanvas = createComponentCanvas(component);
  const rimContext = rimCanvas.getContext("2d");
  if (!rimContext) {
    return null;
  }
  const rimData = rimContext.createImageData(
    rimCanvas.width,
    rimCanvas.height,
  );
  const radius = 1;

  for (let y = 0; y < rimCanvas.height; y += 1) {
    for (let x = 0; x < rimCanvas.width; x += 1) {
      const index = y * rimCanvas.width + x;
      if (maskData.data[index * 4 + 3] <= 10) {
        continue;
      }
      let edge = false;
      for (let offsetY = -radius; offsetY <= radius && !edge; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const neighborX = x + offsetX;
          const neighborY = y + offsetY;
          if (
            neighborX < 0 ||
            neighborY < 0 ||
            neighborX >= rimCanvas.width ||
            neighborY >= rimCanvas.height ||
            maskData.data[
              (neighborY * rimCanvas.width + neighborX) * 4 + 3
            ] <= 10
          ) {
            edge = true;
            break;
          }
        }
      }
      if (!edge) {
        continue;
      }
      const offset = index * 4;
      rimData.data[offset] = 200;
      rimData.data[offset + 1] = 197;
      rimData.data[offset + 2] = 186;
      rimData.data[offset + 3] = 214;
    }
  }
  rimContext.putImageData(rimData, 0, 0);
  rimCache.set(component.componentId, rimCanvas);
  return rimCanvas;
}

export function resolvePresentationComponents(
  country: MapCountryIndex,
  _selectedComponent: MapCountryComponent,
  allComponents: readonly MapCountryComponent[],
): readonly MapCountryComponent[] {
  return allComponents.filter(
    (component) => component.countryId === country.id,
  );
}

export function getDimmedWorldFilter(progress: number): string {
  const brightness =
    mapTheme.brightness *
    (1 - (1 - selectionPresentationConfig.brightness) * progress);
  const saturation =
    mapTheme.saturation *
    (1 - (1 - selectionPresentationConfig.saturation) * progress);
  const contrast =
    mapTheme.contrast *
    (1 - (1 - selectionPresentationConfig.contrast) * progress);
  const format = (value: number) => Number(value.toFixed(4));
  return `brightness(${format(brightness)}) saturate(${format(saturation)}) contrast(${format(contrast)})`;
}

export function drawMapThemeOverlay(
  context: CanvasRenderingContext2D,
  viewport: ViewportSize,
  pixelRatio: number,
): void {
  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.globalCompositeOperation = "multiply";
  context.fillStyle = `rgba(8, 25, 43, ${mapTheme.navyOverlayOpacity})`;
  context.fillRect(0, 0, viewport.width, viewport.height);
  context.globalCompositeOperation = "soft-light";
  context.fillStyle = `rgba(106, 128, 142, ${mapTheme.softLightOpacity})`;
  context.fillRect(0, 0, viewport.width, viewport.height);
  context.globalCompositeOperation = "source-over";
  const vignette = context.createRadialGradient(
    viewport.width / 2,
    viewport.height / 2,
    Math.min(viewport.width, viewport.height) * 0.2,
    viewport.width / 2,
    viewport.height / 2,
    Math.max(viewport.width, viewport.height) * 0.72,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(
    1,
    `rgba(1, 7, 14, ${mapTheme.vignetteOpacity})`,
  );
  context.fillStyle = vignette;
  context.fillRect(0, 0, viewport.width, viewport.height);
  context.restore();
}

export function drawDimmedWorldOverlay(
  context: CanvasRenderingContext2D,
  viewport: ViewportSize,
  pixelRatio: number,
  progress: number,
): void {
  if (progress <= 0) {
    return;
  }
  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.fillStyle = `rgba(3, 10, 18, ${
    selectionPresentationConfig.dimOpacity * progress
  })`;
  context.fillRect(0, 0, viewport.width, viewport.height);
  const vignette = context.createRadialGradient(
    viewport.width / 2,
    viewport.height / 2,
    Math.min(viewport.width, viewport.height) * 0.12,
    viewport.width / 2,
    viewport.height / 2,
    Math.max(viewport.width, viewport.height) * 0.72,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, `rgba(0, 5, 11, ${0.24 * progress})`);
  context.fillStyle = vignette;
  context.fillRect(0, 0, viewport.width, viewport.height);
  context.restore();
}
