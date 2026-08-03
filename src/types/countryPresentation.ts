import type { MapCountryIndex } from "./mapCountry";

export type CountryLeaderPresentation = {
  name: string;
  portraitPath: string | null;
  title: string;
  effects: readonly CountryLeaderEffect[];
};

/** Stable, display-ready leader modifier metadata. `id` values are reserved
 * for the future rules engine; this release only renders the text. */
export type CountryLeaderEffect = {
  id: string;
  name: string;
  lines: readonly CountryLeaderEffectLine[];
};

export type CountryLeaderEffectLine = {
  id: string;
  text: string;
  tone: "positive" | "negative" | "neutral" | "flavor";
};

export type CountryPartyPresentation = {
  id: string;
  name: string;
  ideology: string;
  support: number;
  color?: string;
  symbolPath: string | null;
};

export type CountryPoliticsPresentation = {
  government: string;
  ideology: string;
  rulingParty: string;
  faction: string;
  symbolPath: string | null;
  parties: readonly CountryPartyPresentation[];
};

export type CountryNationalSpirit = {
  id: string;
  name: string;
  description: string;
  imagePath: string | null;
  effects: readonly CountryNationalSpiritEffect[];
};

export type CountryNationalSpiritEffect = {
  text: string;
  tone: "positive" | "negative";
};

export type CountryGalleryItem = {
  imagePath: string;
  caption: string;
};

export type CountryDetailRow = {
  label: string;
  value: string;
};

export type CountryPresentationOverrides = {
  flagPath?: string | null;
  subtitle?: string;
  capital?: string;
  status?: string;
  leader?: Partial<CountryLeaderPresentation>;
  politics?: Partial<CountryPoliticsPresentation>;
  motto?: string;
  description?: string;
  nationalSpirits?: CountryNationalSpirit[];
  gallery?: CountryGalleryItem[];
  details?: CountryDetailRow[];
};

export type CountryPresentationData = {
  country: MapCountryIndex;
  title: string;
  secondaryNames: readonly string[];
  subtitle: string;
  capital: string;
  status: string;
  flagPath: string | null;
  leader: CountryLeaderPresentation;
  politics: CountryPoliticsPresentation;
  motto: string;
  description: string;
  nationalSpirits: readonly CountryNationalSpirit[];
  gallery: readonly CountryGalleryItem[];
  details: readonly CountryDetailRow[];
};
