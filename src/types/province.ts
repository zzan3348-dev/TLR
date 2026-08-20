import type { ImagePoint } from "./mapCountry";

export type ProvinceBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Province = {
  id: string;
  ownerCountryKey?: string;
  controllerCountryKey?: string;
  stateId?: string;
  mapId: number;
  bounds: ProvinceBounds;
  centroid: ImagePoint;
  seed: ImagePoint;
  pixelCount: number;
};

export type ProvinceRegion = {
  id: string;
  name: string;
  provinceIds: string[];
};
