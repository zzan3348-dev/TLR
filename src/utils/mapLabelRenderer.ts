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

export type FixedCountryLabelScreenMetrics = {
  fontSize: number;
  layoutScale: number;
};

/**
 * 국명의 화면상 크기를 결정한다.
 *
 * 이 함수에는 의도적으로 camera.scale, fitScale, viewport를 전달하지 않는다.
 * 줌과 창 크기는 월드 앵커의 화면 위치만 바꿀 수 있고 글꼴 크기와 글자 간격은
 * 절대로 바꾸지 못하게 하기 위한 경계다.
 */
export function getFixedCountryLabelScreenMetrics(
  label: Pick<MapCountryLabel, "fontSize">,
  countryScaleMultiplier = 1,
): FixedCountryLabelScreenMetrics {
  const layoutScale = REFERENCE_MAP_SCREEN_SCALE * countryScaleMultiplier;
  const minimumLayoutScale =
    MIN_SCREEN_FONT_SIZE / Math.max(1, label.fontSize);

  return {
    fontSize: Math.max(MIN_SCREEN_FONT_SIZE, label.fontSize * layoutScale),
    layoutScale: Math.max(minimumLayoutScale, layoutScale),
  };
}

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
    // 국명 전체를 하나의 고정 screen-space 표식으로 취급한다. 지도 좌표에는
    // 중심 앵커만 고정하고 글자별 곡선 오프셋은 고정 픽셀 배율로 계산해야
    // 줌할 때 글자 크기와 자간, 전체 국명 폭이 함께 커지거나 작아지지 않는다.
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
  const fixedMetrics = getFixedCountryLabelScreenMetrics(
    label,
    mapScaleMultiplier,
  );
  const { glyphs, screenFontSize } = createScreenGlyphs(
    label,
    copy,
    camera,
    viewport,
    mapWidth,
    fixedMetrics.fontSize,
    fixedMetrics.layoutScale,
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
      // 투영 폭/면적을 opacity에 다시 곱하면 축소 중 글자의 획이 옅어져
      // 실제 글꼴 크기가 줄어드는 것처럼 보인다. 줌은 최초 LOD 진입 여부만
      // 결정하며, 나타난 국명의 픽셀 크기와 농도는 이후 완전히 고정한다.
      const visibilityOpacity = enterOpacity * closeOpacity;
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

  // 화면 기준 충돌 판정은 줌마다 결과가 달라져 같은 국명이 사라지거나 다른
  // 영토 조각으로 순간 이동하는 원인이 된다. 위치가 확정된 국명은 재배치나
  // 축소 없이 그대로 렌더링한다. reservedBounds는 호출부 호환을 위해 유지한다.
  void reservedBounds;
  return candidates;
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
