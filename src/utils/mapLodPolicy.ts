export const MAP_LOD_POLICY = {
  maxZoomMultiplier: 16,
  markerScreenSize: 16,
  markerScreenSizeMobile: 15,
  capitalMarkerEnter: 0.2,
  capitalMarkerFadeDistance: 0.06,
  capitalLabelEnter: 0.4,
  capitalLabelFadeDistance: 0.07,
  selectedRevealAdvance: 0.08,
  countryLabelEnter: 0.015,
  countryLabelFadeDistance: 0.08,
  countryLabelCloseFadeStart: 0.72,
  countryLabelCloseFadeDistance: 0.14,
  countryLabelMinimumProjectedWidth: 34,
  countryLabelMinimumProjectedArea: 950,
  countryLabelCollisionPadding: 4,
  viewportMargin: 20,
} as const;

export function normalizedMapZoom(scale: number, fitScale: number): number {
  if (fitScale <= 0 || scale <= fitScale) return 0;
  const ratio = Math.max(1, scale / fitScale);
  return Math.min(
    1,
    Math.log(ratio) / Math.log(MAP_LOD_POLICY.maxZoomMultiplier),
  );
}

export function smoothLodVisibility(
  normalizedZoom: number,
  threshold: number,
  fadeDistance: number,
): number {
  const progress = Math.min(
    1,
    Math.max(0, (normalizedZoom - threshold) / Math.max(0.001, fadeDistance)),
  );
  return progress * progress * (3 - 2 * progress);
}
