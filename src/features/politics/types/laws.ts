import type { Modifier } from "./modifiers";

export type LawCategory =
  | "political"
  | "military"
  | "economy"
  | "social";

export type LawRequirement = {
  key: string;
  label: string;
};

export type LawOption = {
  id: string;
  name: string;
  description: string;
  order: number;
  icon: string;
  modifiers: readonly Modifier[];
  requirements: readonly LawRequirement[];
  incompatibilities: readonly string[];
};

export type LawDefinition = {
  id: string;
  category: LawCategory;
  name: string;
  icon: string;
  description: string;
  options: readonly LawOption[];
};

export type CountryLawState = {
  countryId: string;
  laws: Readonly<Record<string, string | "unset">>;
};
