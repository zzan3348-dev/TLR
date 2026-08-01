import type { Modifier } from "./modifiers";

export type DevelopmentTrend = "up" | "stable" | "down";

export type DevelopmentLevel = {
  level: number;
  name: string;
  modifiers: readonly Modifier[];
};

export type DevelopmentDefinition = {
  id: string;
  label: string;
  icon: string;
  levels: readonly DevelopmentLevel[];
};

export type CountryDevelopmentItem = {
  id: string;
  level: number | null;
  trend: DevelopmentTrend;
};

export type CountryDevelopmentState = {
  countryId: string;
  povertyRate: number | null;
  povertyChange: number | null;
  items: readonly CountryDevelopmentItem[];
};
