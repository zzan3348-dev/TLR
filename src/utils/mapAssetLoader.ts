import { MAP_ASSET_VERSION } from "../data/mapAssetVersion";

export type LoadedMapAssets = {
  fill: HTMLImageElement;
  provinceLines: HTMLImageElement;
  countryLines: HTMLImageElement;
  idMapCanvas: HTMLCanvasElement;
  idMapContext: CanvasRenderingContext2D;
  width: number;
  height: number;
};

const ASSET_PATHS = {
  fill: "/maps/generated/world-1932-fill.png",
  provinceLines: "/maps/generated/world-1932-province-lines.png",
  countryLines: "/maps/generated/world-1932-country-lines.png",
  idMap: "/maps/generated/world-1932-id-map.png",
} as const;

function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.draggable = false;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`지도 에셋을 불러오지 못했습니다: ${path}`));
    image.src = `${path}?v=${encodeURIComponent(MAP_ASSET_VERSION)}`;
  });
}

export async function loadMapAssets(): Promise<LoadedMapAssets> {
  const [fill, provinceLines, countryLines, idMap] = await Promise.all([
    loadImage(ASSET_PATHS.fill),
    loadImage(ASSET_PATHS.provinceLines),
    loadImage(ASSET_PATHS.countryLines),
    loadImage(ASSET_PATHS.idMap),
  ]);
  const width = fill.naturalWidth;
  const height = fill.naturalHeight;

  if (
    provinceLines.naturalWidth !== width ||
    countryLines.naturalWidth !== width ||
    idMap.naturalWidth !== width ||
    provinceLines.naturalHeight !== height ||
    countryLines.naturalHeight !== height ||
    idMap.naturalHeight !== height
  ) {
    throw new Error("생성된 지도 레이어의 크기가 서로 일치하지 않습니다.");
  }

  const idMapCanvas = document.createElement("canvas");
  idMapCanvas.width = width;
  idMapCanvas.height = height;
  const idMapContext = idMapCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!idMapContext) {
    throw new Error("국가 ID 맵 Canvas를 초기화할 수 없습니다.");
  }
  idMapContext.imageSmoothingEnabled = false;
  idMapContext.drawImage(idMap, 0, 0);

  return {
    fill,
    provinceLines,
    countryLines,
    idMapCanvas,
    idMapContext,
    width,
    height,
  };
}
