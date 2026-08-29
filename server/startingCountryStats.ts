import countryBaseStats from "../src/features/play/data/countryBaseStats.json" with { type: "json" };

export type StartingCountryStats = {
  country_key: string;
  country_name: string;
  base_political_power: number;
  political_power_per_turn: number;
  base_stability: number;
  base_war_support: number;
  base_available_manpower: number;
};

const stats = countryBaseStats as Record<string, StartingCountryStats>;

export function startingCountryStatsForCountry(
  countryKey: string,
): StartingCountryStats | null {
  const row = stats[countryKey];
  return row ? structuredClone(row) : null;
}

export function allStartingCountryStats(): readonly StartingCountryStats[] {
  return Object.values(stats).map((row) => structuredClone(row));
}

export function currentNumber(
  value: unknown,
  fallback: number,
): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
