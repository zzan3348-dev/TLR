import type {
  FlagFit,
  MapCountryComponent,
  MapCountryIndex,
} from "../types/mapCountry";

type ImageCacheEntry = {
  image: HTMLImageElement | null;
  loading: boolean;
  failed: boolean;
  listeners: Set<() => void>;
};

const imageCache = new Map<string, ImageCacheEntry>();
const compositeCache = new Map<string, HTMLCanvasElement>();

export function getCachedMapImage(
  path: string,
  onReady: () => void,
): HTMLImageElement | null {
  const existing = imageCache.get(path);
  if (existing?.image) {
    return existing.image;
  }
  if (existing?.failed) {
    return null;
  }
  if (existing?.loading) {
    existing.listeners.add(onReady);
    return null;
  }

  const entry: ImageCacheEntry = {
    image: null,
    loading: true,
    failed: false,
    listeners: new Set([onReady]),
  };
  imageCache.set(path, entry);
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    entry.image = image;
    entry.loading = false;
    for (const listener of entry.listeners) {
      listener();
    }
    entry.listeners.clear();
  };
  image.onerror = () => {
    entry.failed = true;
    entry.loading = false;
    entry.listeners.clear();
  };
  image.src = path;
  return null;
}

function drawFittedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  fit: FlagFit,
) {
  if (fit === "stretch") {
    context.drawImage(image, 0, 0, width, height);
    return;
  }

  const scale =
    fit === "contain"
      ? Math.min(width / image.naturalWidth, height / image.naturalHeight)
      : Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    (width - drawnWidth) / 2,
    (height - drawnHeight) / 2,
    drawnWidth,
    drawnHeight,
  );
}

export function getFlagTerritoryOverlay(
  country: MapCountryIndex,
  component: MapCountryComponent,
  mask: HTMLImageElement,
  onReady: () => void,
): HTMLCanvasElement | null {
  if (!country.flagPath) {
    return null;
  }
  const flag = getCachedMapImage(country.flagPath, onReady);
  if (!flag) {
    return null;
  }
  const cacheKey = [
    component.componentId,
    country.flagPath,
    country.flagFit,
  ].join(":");
  const cached = compositeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = component.bounds.width;
  canvas.height = component.bounds.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  drawFittedImage(
    context,
    flag,
    canvas.width,
    canvas.height,
    country.flagFit,
  );
  context.globalCompositeOperation = "destination-in";
  context.drawImage(mask, 0, 0, canvas.width, canvas.height);
  compositeCache.set(cacheKey, canvas);
  return canvas;
}
