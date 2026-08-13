import type { ImagePoint } from "./mapCountry";

export type MapMarkerType =
  | "CAPITAL"
  | "MAJOR_CITY"
  | "WAR_REPORT"
  | "FRONT_MARKER"
  | "STRATEGIC_POINT";

export type MapMarker = {
  id: string;
  type: MapMarkerType;
  countryKey: string;
  name: string;
  position: ImagePoint;
  enabled: boolean;
  priority: number;
  selectable: boolean;
};

export type MapCapitalRecord = {
  countryKey: string;
  name: string;
  x: number | null;
  y: number | null;
  enabled: boolean;
};
