import generatedStates from "./countryEconomyStates.json";
import type { CapacityRecord, EconomyRecord } from "../types";

export const countryEconomyStates = generatedStates as unknown as Readonly<
  Record<string, Partial<EconomyRecord> & Pick<EconomyRecord, "country_key">>
>;

export function getStartingEconomy(countryKey: string): EconomyRecord | null {
  const economy = countryEconomyStates[countryKey];
  return economy
    ? {
        ...structuredClone(economy),
        draft_budget: economy.draft_budget ?? null,
        next_budget: economy.next_budget ?? null,
        next_budget_world_date: economy.next_budget_world_date ?? null,
      } as EconomyRecord
    : null;
}

export function getStartingCapacity(
  economy: EconomyRecord | null,
): CapacityRecord | null {
  if (!economy || economy.base_production_capacity == null) return null;
  const effectiveCapacity =
    economy.base_production_capacity *
    ((economy.production_capacity_modifier ?? 100) / 100);
  return {
    effective_capacity: effectiveCapacity,
    domestic_used: economy.domestic_capacity_used ?? 0,
    committed_out: economy.trade_capacity_provided ?? 0,
    received_in: economy.trade_capacity_received ?? 0,
    available: economy.available_production_capacity ?? Math.max(
      0,
      effectiveCapacity -
        (economy.domestic_capacity_used ?? 0) -
        (economy.trade_capacity_provided ?? 0) +
        (economy.trade_capacity_received ?? 0),
    ),
  };
}
