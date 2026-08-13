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
