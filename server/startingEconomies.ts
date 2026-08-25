import economyStates from "../src/features/economy/data/countryEconomyStates.json" with { type: "json" };

export type StartingEconomyRow = Record<string, unknown> & {
  country_key: string;
};

const states = economyStates as Record<string, StartingEconomyRow>;

export function startingEconomyForCountry(
  countryKey: string,
): StartingEconomyRow | null {
  const row = states[countryKey];
  return row ? structuredClone(row) : null;
}

export function mergeStartingEconomy(
  countryKey: string,
  databaseRow: StartingEconomyRow | null,
): StartingEconomyRow | null {
  const startingRow = startingEconomyForCountry(countryKey);
  if (!startingRow) return databaseRow;
  return databaseRow ? { ...startingRow, ...databaseRow } : startingRow;
}

export function startingCapacityForEconomy(
  economy: StartingEconomyRow | null,
): Record<string, number> | null {
  if (!economy || typeof economy.base_production_capacity !== "number") return null;
  const modifier = typeof economy.production_capacity_modifier === "number"
    ? economy.production_capacity_modifier
    : 100;
  const effectiveCapacity = economy.base_production_capacity * (modifier / 100);
  const numberOr = (value: unknown, fallback = 0) =>
    typeof value === "number" ? value : fallback;
  return {
    effective_capacity: effectiveCapacity,
    domestic_used: numberOr(economy.domestic_capacity_used),
    committed_out: numberOr(economy.trade_capacity_provided),
    received_in: numberOr(economy.trade_capacity_received),
    available: numberOr(
      economy.available_production_capacity,
      Math.max(
        0,
        effectiveCapacity -
          numberOr(economy.domestic_capacity_used) -
          numberOr(economy.trade_capacity_provided) +
          numberOr(economy.trade_capacity_received),
      ),
    ),
  };
}
