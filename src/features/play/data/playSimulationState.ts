import type { MapCountryIndex } from "../../../types/mapCountry";
import type { EconomySnapshot } from "../../economy/types";
import { getStartingCapacity, getStartingEconomy } from "../../economy/data/countryEconomyStates";
import { getCountryBaseStats } from "./countryBaseStats";

export type ProductionCapacity = {
  total: number | null;
  used: number | null;
  fromDomesticEconomy: number | null;
  fromTrade: number | null;
  other: number | null;
};

export type PlaySimulationState = {
  countryKey: string;
  politicalPower: number;
  politicalPowerChange: number;
  basePoliticalPower: number;
  baseStability: number;
  stability: number;
  baseWarSupport: number;
  warSupport: number;
  baseManpower: number;
  manpowerModifierPercent: number;
  mobilizableManpower: number;
  activeMilitaryManpower: number;
  manpower: number;
  reservedManpower: number;
  productionCapacity: ProductionCapacity;
  gdp: number | null;
  nominalGrowth: number | null;
  inflation: number | null;
  realGrowth: number | null;
  debt: number | null;
  debtToGdp: number | null;
  povertyRate: number | null;
  unemploymentRate: number | null;
  researchCapacity: number | null;
  tradeCapacityProvided: number | null;
  bondInterestRate: number | null;
  creditRating: string | null;
  graphs: {
    gdp: readonly number[];
    inflation: readonly number[];
    debtRatio: readonly number[];
    poverty: readonly number[];
  };
  isPlaceholder: boolean;
  dataStatus: "unconfigured" | "partial" | "ready";
};

export const ZERO_PLAY_SIMULATION_STATE: PlaySimulationState = {
  countryKey: "__placeholder__",
  politicalPower: 0,
  politicalPowerChange: 0,
  basePoliticalPower: 0,
  baseStability: 0,
  stability: 0,
  baseWarSupport: 0,
  warSupport: 0,
  baseManpower: 0,
  manpowerModifierPercent: 0,
  mobilizableManpower: 0,
  activeMilitaryManpower: 0,
  manpower: 0,
  reservedManpower: 0,
  productionCapacity: {
    total: null,
    used: null,
    fromDomesticEconomy: null,
    fromTrade: null,
    other: null,
  },
  gdp: null,
  nominalGrowth: null,
  inflation: null,
  realGrowth: null,
  debt: null,
  debtToGdp: null,
  povertyRate: null,
  unemploymentRate: null,
  researchCapacity: null,
  tradeCapacityProvided: null,
  bondInterestRate: null,
  creditRating: null,
  graphs: {
    gdp: [0, 0, 0, 0, 0, 0],
    inflation: [0, 0, 0, 0, 0, 0],
    debtRatio: [0, 0, 0, 0, 0, 0],
    poverty: [0, 0, 0, 0, 0, 0],
  },
  isPlaceholder: true,
  dataStatus: "unconfigured",
};

export function getPlaySimulationState(
  country: MapCountryIndex,
  snapshot: EconomySnapshot | null = null,
): PlaySimulationState {
  const economy = snapshot?.economy ?? getStartingEconomy(country.key);
  const capacity = snapshot?.productionCapacity ?? getStartingCapacity(economy);
  const gdp = economy?.gdp ?? null;
  const debt = economy?.national_debt ?? null;
  const nationalStats = snapshot?.nationalStats ?? null;
  const baseStats = getCountryBaseStats(country.key);
  return {
    ...ZERO_PLAY_SIMULATION_STATE,
    countryKey: country.key,
    politicalPower: nationalStats?.politicalPower ?? baseStats?.base_political_power ?? 0,
    politicalPowerChange: nationalStats?.politicalPowerPerTurn ?? baseStats?.political_power_per_turn ?? 0,
    basePoliticalPower: nationalStats?.basePoliticalPower ?? baseStats?.base_political_power ?? 0,
    baseStability: nationalStats?.baseStability ?? baseStats?.base_stability ?? 0,
    stability: nationalStats?.stability ?? baseStats?.base_stability ?? 0,
    baseWarSupport: nationalStats?.baseWarSupport ?? baseStats?.base_war_support ?? 0,
    warSupport: nationalStats?.warSupport ?? baseStats?.base_war_support ?? 0,
    baseManpower: nationalStats?.baseAvailableManpower ?? baseStats?.base_available_manpower ?? 0,
    manpowerModifierPercent: nationalStats?.manpowerModifierPercent ?? 0,
    mobilizableManpower: nationalStats?.mobilizableManpower ?? baseStats?.base_available_manpower ?? 0,
    activeMilitaryManpower: nationalStats?.activeMilitaryManpower ?? 0,
    manpower: nationalStats?.availableManpower ?? baseStats?.base_available_manpower ?? 0,
    reservedManpower: nationalStats?.reservedManpower ?? 0,
    productionCapacity: capacity
      ? {
          total: capacity.effective_capacity,
          used: capacity.domestic_used,
          fromDomesticEconomy: capacity.effective_capacity,
          fromTrade: capacity.received_in - capacity.committed_out,
          other: 0,
        }
      : { ...ZERO_PLAY_SIMULATION_STATE.productionCapacity },
    gdp,
    nominalGrowth: economy?.nominal_growth_rate ?? null,
    inflation: economy?.inflation_rate ?? null,
    realGrowth:
      economy?.nominal_growth_rate != null && economy.inflation_rate != null
        ? economy.nominal_growth_rate - economy.inflation_rate
        : null,
    debt,
    debtToGdp: debt != null && gdp != null && gdp !== 0 ? (debt / gdp) * 100 : null,
    unemploymentRate: economy?.unemployment_rate ?? null,
    povertyRate: economy?.poverty_rate ?? null,
    researchCapacity: economy?.research_capacity ?? null,
    tradeCapacityProvided: economy?.trade_capacity_provided ?? null,
    bondInterestRate: economy?.bond_interest_rate ?? null,
    creditRating: economy?.credit_rating ?? null,
    graphs: { ...ZERO_PLAY_SIMULATION_STATE.graphs },
    isPlaceholder: !economy || !baseStats,
    dataStatus: economy && baseStats
      ? snapshot
        ? snapshot.readiness.toLowerCase() as PlaySimulationState["dataStatus"]
        : "ready"
      : "unconfigured",
  };
}

export function formatPercent(value: number | null): string {
  if (value == null) return "미설정";
  return `${value.toFixed(2)}%`;
}

export function formatSigned(value: number | null): string {
  if (value == null) return "미설정";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function formatBillions(value: number | null): string {
  if (value == null) return "미설정";
  return `$${value.toFixed(2)}B`;
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}
