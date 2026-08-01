import type { FactionMembership } from "./faction";

export type FlagFit = "cover" | "contain" | "stretch";
export type FlagFocusMode =
  | "selected-component"
  | "selected-display-group"
  | "all-territories";
export type FlagBlendMode =
  | "source-over"
  | "multiply"
  | "overlay"
  | "soft-light";
export type MapLabelMode = "auto" | "manual" | "hidden";
export type MapLabelLayoutMode = "straight" | "arc-up" | "arc-down";

export type MapCountryLabelSettings = {
  enabled: boolean;
  componentId: string | null;
  mode: MapLabelMode;
  text: string | null;
  x: number | null;
  y: number | null;
  angle: number | null;
  fontSize: number | null;
  letterSpacing: number | null;
  minZoom: number | null;
  priority: number | null;
};

export type MapCountryIndex = {
  id: number;
  key: string;
  color: string;
  internalName: string;
  name: string;
  nativeName: string;
  englishName: string;
  shortName: string;
  mapLabel: string;
  shortLabel: string;
  allowShortMapLabel: boolean;
  label: MapCountryLabelSettings;
  labelRepeat: MapLabelRepeatSettings;
  labelGroups: MapCountryLabelGroupSettings[];
  grouping: MapCountryGroupingSettings;
  flagPath: string | null;
  flagFit: FlagFit;
  flagOpacity: number;
  flagFocusMode: FlagFocusMode;
  flagBlendMode: FlagBlendMode;
  factionMembership?: FactionMembership | null;
};

export type MapCountryManualDisplayGroup = {
  id: string;
  physicalComponentIds: string[];
};

export type MapCountryGroupingSettings = {
  mode: "auto" | "manual";
  archipelagoMode: boolean;
  mergeDistance: number;
  smallIslandMergeDistance: number;
  largeOverseasSplitDistance: number;
  labelEnvelopeBuffer: number;
  manualGroups: MapCountryManualDisplayGroup[];
  excludedPhysicalComponentIds: string[];
};

export type MapLabelRepeatSettings = {
  enabled: boolean;
  minimumPixelArea: number;
  minimumRelativeArea: number;
  minimumBoundsWidth: number;
  minimumBoundsHeight: number;
  maxAutomaticLabels: number;
};

export type MapCountryLabelGroupSettings = {
  id: string;
  mode: MapLabelMode;
  componentIds: string[];
  enabled: boolean;
  text: string | null;
  layoutMode: MapLabelLayoutMode | null;
  x: number | null;
  y: number | null;
  angle: number | null;
  curvature: number | null;
  fontSize: number | null;
  letterSpacing: number | null;
  minZoom: number | null;
  priority: number | null;
  start: ImagePoint | null;
  control: ImagePoint | null;
  end: ImagePoint | null;
};

export type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type ImagePoint = {
  x: number;
  y: number;
};

export type MapBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MapCountryComponent = {
  countryId: number;
  componentId: string;
  displayGroupId: string;
  physicalComponentIds: string[];
  bounds: MapBounds;
  centroid: ImagePoint;
  pixelCount: number;
  representative: ImagePoint;
  maskPath: string;
  labelEnvelopePath: string | null;
  labelEnvelopeBuffer: number;
  archipelago: boolean;
  wrapsX: boolean;
  groupedTerritoryCount: number;
};

export type MapCamera = {
  x: number;
  y: number;
  scale: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type MapCountryLabel = {
  countryId: number;
  componentId: string;
  labelGroupId: string;
  text: string;
  layoutMode: MapLabelLayoutMode;
  pathType: "quadratic";
  start: ImagePoint;
  control: ImagePoint;
  end: ImagePoint;
  x: number;
  y: number;
  angle: number;
  curvature: number;
  fontSize: number;
  letterSpacing: number;
  maxWidth: number;
  groupPixelCount: number;
  priority: number;
  minZoom: number;
  maxZoom: number | null;
  visible: boolean;
  fitRatio: number;
  ownershipFitRatio: number;
  candidateScore: number;
  mode: MapLabelMode;
  hiddenReason: string | null;
};
