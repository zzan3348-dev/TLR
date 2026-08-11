import mapCountryData from "../src/data/mapCountries.json" with { type: "json" };

export type NaviCountry = {
  id: number;
  key: string;
  name: string;
  nativeName: string;
  englishName: string;
  shortName: string;
  flagPath: string | null;
  playPath: string;
};

type RawCountry = {
  id: number;
  key: string;
  name: string;
  nativeName?: string;
  englishName?: string;
  shortName?: string;
  flagPath?: string | null;
};

const countries = new Map(
  (mapCountryData as RawCountry[]).map((country) => [country.key, country]),
);

export function naviCountryByKey(countryKey: string): NaviCountry | null {
  const country = countries.get(countryKey);
  if (!country) return null;
  return {
    id: country.id,
    key: country.key,
    name: country.name,
    nativeName: country.nativeName ?? "",
    englishName: country.englishName ?? "",
    shortName: country.shortName ?? "",
    flagPath: country.flagPath ?? null,
    playPath: `/play/${country.key}`,
  };
}

export function listNaviCountries(): NaviCountry[] {
  return [...countries.keys()]
    .map(naviCountryByKey)
    .filter((country): country is NaviCountry => country !== null);
}
