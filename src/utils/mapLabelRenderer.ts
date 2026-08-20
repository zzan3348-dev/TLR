import type {
  ImagePoint,
  MapCamera,
  MapCountryLabel,
  ViewportSize,
} from "../types/mapCountry";
import { getMapLabelScreenScale } from "../data/mapLabelDisplayOverrides";
import {
  MAP_LOD_POLICY,
  normalizedMapZoom,
  smoothLodVisibility,
} from "./mapLodPolicy";

export type LabelBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type ScreenGlyph = {
  character: string;
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
  bounds: LabelBounds;
};

export type ScreenMapLabel = {
  label: MapCountryLabel;
  copy: number;
  screenFontSize: number;
  x: number;
  y: number;
  width: number;
  height: number;
  bounds: LabelBounds;
  glyphs: ScreenGlyph[];
  selected: boolean;
  visibilityOpacity: number;
};

type LayoutMapLabelsOptions = {
  labels: readonly MapCountryLabel[];
  camera: MapCamera;
  viewport: ViewportSize;
  mapWidth: number;
  fitScale: number;
  selectedCountryId: number | null;
  selectedComponentId: string | null;
  reservedBounds?: readonly LabelBounds[];
};

const MIN_SCREEN_FONT_SIZE = 7.5;
const LABEL_COLLISION_PADDING = 2;
const VIEWPORT_MARGIN = 12;
// 원본 5632px 지도를 1920px 기준 화면에 표시하던 기존 시각 크기다.
// 뷰포트와 카메라 배율 대신 이 기준값만 사용해 국명 크기를 고정한다.
const REFERENCE_MAP_SCREEN_SCALE = 1920 / 5632;

export function getRotatedLabelBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  angleDegrees: number,
): LabelBounds {
  const angle = (angleDegrees * Math.PI) / 180;
  const rotatedWidth =
    Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle));
  const rotatedHeight =
    Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle));
  return {
    left: x - rotatedWidth / 2,
    top: y - rotatedHeight / 2,
    right: x + rotatedWidth / 2,
    bottom: y + rotatedHeight / 2,
  };
}

export function doLabelBoundsOverlap(
  first: LabelBounds,
  second: LabelBounds,
  padding = LABEL_COLLISION_PADDING,
): boolean {
  return !(
    first.right + padding <= second.left ||
    second.right + padding <= first.left ||
    first.bottom + padding <= second.top ||
    second.bottom + padding <= first.top
  );
}

function quadraticPoint(
  start: ImagePoint,
  control: ImagePoint,
  end: ImagePoint,
  t: number,
): ImagePoint {
  const inverse = 1 - t;
  return {
    x:
      inverse * inverse * start.x +
      2 * inverse * t * control.x +
      t * t * end.x,
    y:
      inverse * inverse * start.y +
      2 * inverse * t * control.y +
      t * t * end.y,
  };
}

function quadraticAngle(
  start: ImagePoint,
  control: ImagePoint,
  end: ImagePoint,
  t: number,
): number {
  const x =
    2 * (1 - t) * (control.x - start.x) +
    2 * t * (end.x - control.x);
  const y =
    2 * (1 - t) * (control.y - start.y) +
    2 * t * (end.y - control.y);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function worldToScreen(
  point: ImagePoint,
  copy: number,
  camera: MapCamera,
  viewport: ViewportSize,
  mapWidth: number,
): ImagePoint {
  return {
    x:
      viewport.width / 2 +
      (point.x + copy * mapWidth - camera.x) * camera.scale,
    y: viewport.height / 2 + (point.y - camera.y) * camera.scale,
  };
}

function unionBounds(bounds: readonly LabelBounds[]): LabelBounds {
  return bounds.reduce(
    (result, current) => ({
      left: Math.min(result.left, current.left),
      top: Math.min(result.top, current.top),
      right: Math.max(result.right, current.right),
      bottom: Math.max(result.bottom, current.bottom),
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );
}

function createScreenGlyphs(
  label: MapCountryLabel,
  copy: number,
  camera: MapCamera,
  viewport: ViewportSize,
  mapWidth: number,
  screenFontSize: number,
  fixedLayoutScale: number,
): { glyphs: ScreenGlyph[]; screenFontSize: number } {
  const characters = [...label.text];
  const approximateGlyphWidth = label.fontSize * 0.9;
  const renderScale = screenFontSize / Math.max(1, label.fontSize);
  const pathWorldCenter = quadraticPoint(
    label.start,
    label.control,
    label.end,
    0.5,
  );
  const pathAnchorOffset = {
    x: label.x - pathWorldCenter.x,
    y: label.y - pathWorldCenter.y,
  };
  const labelAnchor = worldToScreen(
    { x: label.x, y: label.y },
    copy,
    camera,
    viewport,
    mapWidth,
  );
  const totalWidth =
    characters.length * approximateGlyphWidth +
    Math.max(0, characters.length - 1) * label.letterSpacing;
  let cursor = 0;

  const glyphs = characters.map((character) => {
    const center = cursor + approximateGlyphWidth / 2;
    const t = totalWidth > 0 ? center / totalWidth : 0.5;
    const worldPoint = quadraticPoint(
      label.start,
      label.control,
      label.end,
      t,
    );
    const anchoredWorldPoint = {
      x: worldPoint.x + pathAnchorOffset.x,
      y: worldPoint.y + pathAnchorOffset.y,
    };
    const screenPoint = {
      x: labelAnchor.x + (anchoredWorldPoint.x - label.x) * fixedLayoutScale,
      y: labelAnchor.y + (anchoredWorldPoint.y - label.y) * fixedLayoutScale,
    };
    const angle = quadraticAngle(
      label.start,
      label.control,
      label.end,
      t,
    );
    const width = approximateGlyphWidth * renderScale;
    const height = label.fontSize * 1.12 * renderScale;
    cursor += approximateGlyphWidth + label.letterSpacing;
    return {
      character,
      x: screenPoint.x,
      y: screenPoint.y,
      angle,
      width,
      height,
      bounds: getRotatedLabelBounds(
        screenPoint.x,
        screenPoint.y,
        width,
        height,
        angle,
      ),
    };
  });
  return { glyphs, screenFontSize };
}

function createScreenPlacement(
  label: MapCountryLabel,
  copy: number,
  camera: MapCamera,
  viewport: ViewportSize,
  mapWidth: number,
  mapScaleMultiplier: number,
  selected: boolean,
  visibilityOpacity: number,
): ScreenMapLabel | null {
  // 국명은 지도 위의 좌표를 따르지만, 글꼴과 곡선 간격은 화면 픽셀로
  // 고정한다. fitScale/camera.scale을 섞으면 창 크기와 줌에 따라 글씨가
  // 커졌다 작아지는 회귀가 생긴다.
  const fixedScreenScale = REFERENCE_MAP_SCREEN_SCALE * mapScaleMultiplier;
  const { glyphs, screenFontSize } = createScreenGlyphs(
    label,
    copy,
    camera,
    viewport,
    mapWidth,
    Math.max(
      MIN_SCREEN_FONT_SIZE,
      label.fontSize * fixedScreenScale,
    ),
    Math.max(
      MIN_SCREEN_FONT_SIZE / Math.max(1, label.fontSize),
      fixedScreenScale,
    ),
  );
  if (glyphs.length === 0) {
    return null;
  }
  const bounds = unionBounds(glyphs.map((glyph) => glyph.bounds));
  if (
    bounds.right < -VIEWPORT_MARGIN ||
    bounds.left > viewport.width + VIEWPORT_MARGIN ||
    bounds.bottom < -VIEWPORT_MARGIN ||
    bounds.top > viewport.height + VIEWPORT_MARGIN
  ) {
    return null;
  }
  const x = (bounds.left + bounds.right) / 2;
  const y = (bounds.top + bounds.bottom) / 2;
  return {
    label,
    copy,
    screenFontSize,
    x,
    y,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
    bounds,
    glyphs,
    selected,
    visibilityOpacity,
  };
}

export function layoutMapLabels({
  labels,
  camera,
  viewport,
  mapWidth,
  fitScale,
  selectedCountryId,
  selectedComponentId,
  reservedBounds = [],
}: LayoutMapLabelsOptions): ScreenMapLabel[] {
  const zoom = camera.scale / fitScale;
  const normalizedZoom = normalizedMapZoom(camera.scale, fitScale);
  const candidates: ScreenMapLabel[] = [];

  for (const label of labels) {
    const isUnselectedComponentOfSelectedCountry =
      selectedCountryId !== null &&
      selectedComponentId !== null &&
      label.countryId === selectedCountryId &&
      label.componentId !== selectedComponentId;
    const canRecoverAtCloserZoom =
      !label.visible &&
      label.hiddenReason === "insufficient-territory-fit";
    if (
      isUnselectedComponentOfSelectedCountry ||
      (!label.visible && !canRecoverAtCloserZoom) ||
      !label.text ||
      zoom < label.minZoom ||
      (label.maxZoom !== null && zoom > label.maxZoom)
    ) {
      continue;
    }
    for (let copy = -1; copy <= 1; copy += 1) {
      const selected =
        label.countryId === selectedCountryId &&
        label.componentId === selectedComponentId;
      const mapScaleMultiplier = getMapLabelScreenScale(label.countryId);
      const selectedAdvance = selected
        ? MAP_LOD_POLICY.selectedRevealAdvance
        : 0;
      const enterOpacity = smoothLodVisibility(
        normalizedZoom,
        MAP_LOD_POLICY.countryLabelEnter - selectedAdvance,
        MAP_LOD_POLICY.countryLabelFadeDistance,
      );
      // 수도가 표시되는 근거리에서도 국명을 유지한다. 줌은 국명을 다시
      // 숨기거나 크기를 바꾸지 않고, 처음 나타나는 시점만 결정한다.
      const closeOpacity = 1;
      const projectedWidth = label.maxWidth * camera.scale;
      const projectedArea = label.groupPixelCount * camera.scale ** 2;
      const projectedOpacity = Math.min(
        1,
        Math.max(
          projectedWidth / MAP_LOD_POLICY.countryLabelMinimumProjectedWidth,
          projectedArea / MAP_LOD_POLICY.countryLabelMinimumProjectedArea,
        ),
      );
      // 국명 글자와 곡선을 지도 좌표계에 고정한다. 줌은 가시성만 바꾸며
      // 영토에 대한 글자의 상대 크기·방향·간격은 다시 계산하지 않는다.
      const visibilityOpacity = enterOpacity * closeOpacity * projectedOpacity;
      if (visibilityOpacity <= 0.01) continue;
      const placement = createScreenPlacement(
        label,
        copy,
        camera,
        viewport,
        mapWidth,
        mapScaleMultiplier,
        selected,
        visibilityOpacity,
      );
      if (placement) {
        candidates.push(placement);
      }
    }
  }

  candidates.sort((first, second) => {
    if (first.selected !== second.selected) {
      return first.selected ? -1 : 1;
    }
    if (first.label.mode !== second.label.mode) {
      return first.label.mode === "manual" ? -1 : 1;
    }
    if (first.label.groupPixelCount !== second.label.groupPixelCount) {
      return second.label.groupPixelCount - first.label.groupPixelCount;
    }
    if (first.label.priority !== second.label.priority) {
      return second.label.priority - first.label.priority;
    }
    // 화면 중심과의 거리는 pan마다 달라지므로 충돌 우선순위로 쓰지 않는다.
    // 동일한 지도 상태에서 국명이 번갈아 사라지는 현상을 방지한다.
    if (first.label.countryId !== second.label.countryId) {
      return first.label.countryId - second.label.countryId;
    }
    return first.copy - second.copy;
  });

  const occupied = [...reservedBounds];
  const accepted: ScreenMapLabel[] = [];
  const acceptedCountryIds = new Set<number>();
  for (const candidate of candidates) {
    const collides = occupied.some((bounds) =>
      doLabelBoundsOverlap(
        candidate.bounds,
        bounds,
        MAP_LOD_POLICY.countryLabelCollisionPadding,
      ),
    );
    // 충돌 회피 때문에 한 국가의 국명이 전부 사라지는 일은 막는다.
    // 이미 같은 국가의 라벨이 하나 보이는 경우에만 추가 라벨을 생략한다.
    if (
      collides &&
      !candidate.selected &&
      acceptedCountryIds.has(candidate.label.countryId)
    ) {
      continue;
    }
    accepted.push(candidate);
    occupied.push(candidate.bounds);
    acceptedCountryIds.add(candidate.label.countryId);
  }
  return accepted;
}

export function drawMapLabels(
  context: CanvasRenderingContext2D,
  placements: readonly ScreenMapLabel[],
  pixelRatio: number,
  presentationProgress = 0,
): void {
  for (const placement of placements) {
    const { selected } = placement;
    const fontSize = placement.screenFontSize;
    for (const glyph of placement.glyphs) {
      context.save();
      context.setTransform(
        pixelRatio,
        0,
        0,
        pixelRatio,
        pixelRatio * glyph.x,
        pixelRatio * glyph.y,
      );
      context.rotate((glyph.angle * Math.PI) / 180);
      const selectionOpacity = selected
        ? 1
        : Math.max(0.24, 1 - presentationProgress * 0.68);
      context.globalAlpha =
        placement.visibilityOpacity * selectionOpacity;
      context.font = `700 ${fontSize}px "Noto Serif KR", "Nanum Myeongjo", "Batang", serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineJoin = "round";
      context.lineWidth = selected
        ? 1.45 + presentationProgress * 0.15
        : 1.35;
      context.strokeStyle = selected
        ? "rgba(22, 18, 15, 0.94)"
        : "rgba(5, 10, 16, 0.74)";
      context.fillStyle = selected
        ? "rgba(232, 224, 205, 1)"
        : "rgba(229, 227, 215, 0.9)";
      context.shadowColor = "rgba(0, 0, 0, 0.42)";
      context.shadowBlur = selected ? 1.7 : 1.5;
      context.shadowOffsetY = 0.7;
      context.strokeText(glyph.character, 0, 0);
      context.fillText(glyph.character, 0, 0);
      context.restore();
    }
  }
}
