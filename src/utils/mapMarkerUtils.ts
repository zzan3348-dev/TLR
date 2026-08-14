import type { LabelBounds } from "./mapLabelRenderer";
import type { MapCamera, ViewportSize } from "../types/mapCountry";
import type { MapMarker } from "../types/mapMarker";
import {
  MAP_LOD_POLICY,
  normalizedMapZoom,
  smoothLodVisibility,
} from "./mapLodPolicy";

export type ScreenMapMarker = {
  marker: MapMarker;
  copy: number;
  x: number;
  y: number;
  size: number;
  markerOpacity: number;
  labelOpacity: number;
  labelBounds: LabelBounds | null;
};

type DrawMapMarkersOptions = {
  selectedCountryKey: string | null;
  hostileCountryKeys: ReadonlySet<string>;
  showLabels: boolean;
};

function traceCapitalStar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  const innerRadius = radius * 0.44;
  context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + point * Math.PI / 5;
    const pointRadius = point % 2 === 0 ? radius : innerRadius;
    const pointX = x + Math.cos(angle) * pointRadius;
    const pointY = y + Math.sin(angle) * pointRadius;
    if (point === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.closePath();
}

/**
 * 수도를 지도와 같은 캔버스 프레임에 그린다. DOM 오버레이가 카메라보다
 * 한 프레임 늦게 따라오며 떨리는 현상을 막고, 크기는 screen-space로 유지한다.
 */
export function drawMapMarkers(
  context: CanvasRenderingContext2D,
  markers: readonly ScreenMapMarker[],
  pixelRatio: number,
  options: DrawMapMarkersOptions,
): void {
  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.lineJoin = "round";

  for (const screenMarker of markers) {
    const selected =
      screenMarker.marker.countryKey === options.selectedCountryKey;
    const hostile =
      !selected &&
      options.hostileCountryKeys.has(screenMarker.marker.countryKey);
    const radius = screenMarker.size / 2;

    context.save();
    context.globalAlpha = screenMarker.markerOpacity;
    context.shadowColor = "rgba(0, 0, 0, 0.92)";
    context.shadowBlur = 2;
    context.shadowOffsetY = 1;
    traceCapitalStar(context, screenMarker.x, screenMarker.y, radius - 1);
    context.fillStyle = selected
      ? "#143a22"
      : hostile
        ? "#3d1111"
        : "#050606";
    context.strokeStyle = selected
      ? "#71e49a"
      : hostile
        ? "#f06a65"
        : "#f4f2ea";
    context.lineWidth = 1.65;
    context.fill();
    context.stroke();
    context.restore();

    if (options.showLabels && screenMarker.labelOpacity > 0) {
      context.save();
      context.globalAlpha = screenMarker.labelOpacity;
      context.font =
        '700 13px "Noto Serif KR", "Nanum Myeongjo", "Batang", serif';
      context.lineWidth = 2.5;
      context.strokeStyle = "rgba(3, 5, 7, 0.96)";
      context.fillStyle = "#e9e4d6";
      const labelX = screenMarker.x + radius + 5;
      context.strokeText(screenMarker.marker.name, labelX, screenMarker.y);
      context.fillText(screenMarker.marker.name, labelX, screenMarker.y);
      context.restore();
    }
  }
  context.restore();
}

export function projectMapMarkers(options: {
  markers: readonly MapMarker[];
  camera: MapCamera;
  viewport: ViewportSize;
  mapWidth: number;
  fitScale: number;
  selectedCountryKey: string | null;
  mobile: boolean;
  forceVisible?: boolean;
}): ScreenMapMarker[] {
  const {
    markers,
    camera,
    viewport,
    mapWidth,
    fitScale,
    selectedCountryKey,
    mobile,
    forceVisible = false,
  } = options;
  const zoom = normalizedMapZoom(camera.scale, fitScale);
  const size = mobile ? MAP_LOD_POLICY.markerScreenSizeMobile : MAP_LOD_POLICY.markerScreenSize;
  const result: ScreenMapMarker[] = [];

  for (const marker of markers) {
    if (!marker.enabled) continue;
    const selected = marker.countryKey === selectedCountryKey;
    const advance = selected ? MAP_LOD_POLICY.selectedRevealAdvance : 0;
    const markerOpacity = forceVisible
      ? 1
      : smoothLodVisibility(
          zoom,
          MAP_LOD_POLICY.capitalMarkerEnter - advance,
          MAP_LOD_POLICY.capitalMarkerFadeDistance,
        );
    const labelOpacity = forceVisible
      ? 1
      : smoothLodVisibility(
          zoom,
          MAP_LOD_POLICY.capitalLabelEnter - advance,
          MAP_LOD_POLICY.capitalLabelFadeDistance,
        );
    if (markerOpacity <= 0) continue;

    for (let copy = -1; copy <= 1; copy += 1) {
      const x = viewport.width / 2 +
        (marker.position.x + copy * mapWidth - camera.x) * camera.scale;
      const y = viewport.height / 2 +
        (marker.position.y - camera.y) * camera.scale;
      if (
        x < -MAP_LOD_POLICY.viewportMargin ||
        x > viewport.width + MAP_LOD_POLICY.viewportMargin ||
        y < -MAP_LOD_POLICY.viewportMargin ||
        y > viewport.height + MAP_LOD_POLICY.viewportMargin
      ) continue;

      const labelWidth = Math.max(34, [...marker.name].length * 13);
      const labelBounds = labelOpacity > 0
        ? { left: x + size * 0.72, top: y - 9, right: x + size * 0.72 + labelWidth, bottom: y + 9 }
        : null;
      result.push({ marker, copy, x, y, size, markerOpacity, labelOpacity, labelBounds });
    }
  }
  return result;
}
