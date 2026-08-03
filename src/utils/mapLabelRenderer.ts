import type {
  ImagePoint,
  MapCamera,
  MapCountryLabel,
  ViewportSize,
} from "../types/mapCountry";
import { getMapLabelScreenScale } from "../data/mapLabelDisplayOverrides";

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
  centerDistance: number;
};

type LayoutMapLabelsOptions = {
  labels: readonly MapCountryLabel[];
  camera: MapCamera;
  viewport: ViewportSize;
  mapWidth: number;
  fitScale: number;
  selectedCountryId: number | null;
  selectedComponentId: string | null;
};

const MIN_SCREEN_FONT_SIZE = 7.5;
const LABELS_MIN_ZOOM = 1.28;
const SCREEN_PATH_TRACKING = 1.045;
const LABEL_COLLISION_PADDING = 2;
const VIEWPORT_MARGIN = 12;

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
  fixedScreenFontSize: number,
): { glyphs: ScreenGlyph[]; screenFontSize: number } {
  const characters = [...label.text];
  const approximateGlyphWidth = label.fontSize * 0.9;
  const screenFontSize = fixedScreenFontSize;
  const renderScale = screenFontSize / Math.max(1, label.fontSize);
  const pathScale =
    (renderScale / Math.max(0.0001, camera.scale)) *
    SCREEN_PATH_TRACKING;
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
  const screenPathCenter = worldToScreen(
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
    const unscaledScreenPoint = worldToScreen(
      anchoredWorldPoint,
      copy,
      camera,
      viewport,
      mapWidth,
    );
    const screenPoint = {
      x:
        screenPathCenter.x +
        (unscaledScreenPoint.x - screenPathCenter.x) * pathScale,
      y:
        screenPathCenter.y +
        (unscaledScreenPoint.y - screenPathCenter.y) * pathScale,
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

function labelsCollide(
  first: ScreenMapLabel,
  second: ScreenMapLabel,
): boolean {
  if (!doLabelBoundsOverlap(first.bounds, second.bounds, 0)) {
    return false;
  }
  return first.glyphs.some((firstGlyph) =>
    second.glyphs.some((secondGlyph) =>
      doLabelBoundsOverlap(firstGlyph.bounds, secondGlyph.bounds),
    ),
  );
}

function createScreenPlacement(
  label: MapCountryLabel,
  copy: number,
  camera: MapCamera,
  viewport: ViewportSize,
  mapWidth: number,
  fixedScreenFontSize: number,
  selected: boolean,
): ScreenMapLabel | null {
  const { glyphs, screenFontSize } = createScreenGlyphs(
    label,
    copy,
    camera,
    viewport,
    mapWidth,
    fixedScreenFontSize,
  );
  if (glyphs.length === 0 || screenFontSize < MIN_SCREEN_FONT_SIZE) {
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
    centerDistance: Math.hypot(
      x - viewport.width / 2,
      y - viewport.height / 2,
    ),
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
}: LayoutMapLabelsOptions): ScreenMapLabel[] {
  const zoom = camera.scale / fitScale;
  if (zoom < LABELS_MIN_ZOOM) {
    return [];
  }
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
      const fixedScreenFontSize = Math.max(
        MIN_SCREEN_FONT_SIZE,
        label.fontSize * fitScale * getMapLabelScreenScale(label.countryId),
      );
      const placement = createScreenPlacement(
        label,
        copy,
        camera,
        viewport,
        mapWidth,
        fixedScreenFontSize,
        selected,
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
    if (first.label.groupPixelCount !== second.label.groupPixelCount) {
      return second.label.groupPixelCount - first.label.groupPixelCount;
    }
    if (first.label.priority !== second.label.priority) {
      return second.label.priority - first.label.priority;
    }
    if (first.centerDistance !== second.centerDistance) {
      return first.centerDistance - second.centerDistance;
    }
    if (first.label.countryId !== second.label.countryId) {
      return first.label.countryId - second.label.countryId;
    }
    return first.copy - second.copy;
  });

  const accepted: ScreenMapLabel[] = [];
  for (const candidate of candidates) {
    const collidesWithAccepted = (placement: ScreenMapLabel) =>
      accepted.some(
        (placed) =>
          placed.copy === placement.copy &&
          labelsCollide(placed, placement),
      );
    const collides = collidesWithAccepted(candidate);
    if (!collides || candidate.selected) {
      accepted.push(candidate);
      continue;
    }

    if (zoom >= 2) {
      accepted.push(candidate);
    }
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
      context.globalAlpha = selected
        ? 1
        : Math.max(0.24, 1 - presentationProgress * 0.68);
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
