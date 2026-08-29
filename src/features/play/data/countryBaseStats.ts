import generatedStats from "./countryBaseStats.json";

export type CountryBaseStats = {
  country_key: string;
  country_name: string;
  base_political_power: number;
  political_power_per_turn: number;
  base_stability: number;
  base_war_support: number;
  base_available_manpower: number;
};

const countryBaseStats = generatedStats as Readonly<Record<string, CountryBaseStats>>;

export function getCountryBaseStats(countryKey: string): CountryBaseStats | null {
  const row = countryBaseStats[countryKey];
  return row ? structuredClone(row) : null;
}
