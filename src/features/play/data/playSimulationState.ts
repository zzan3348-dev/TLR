import type { MapCountryIndex } from "../../../types/mapCountry";
import type { EconomySnapshot } from "../../economy/types";

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
  stability: number;
  warSupport: number;
  manpower: number;
  productionCapacity: ProductionCapacity;
  gdp: number | null;
  nominalGrowth: number | null;
  inflation: number | null;
  realGrowth: number | null;
  debt: number | null;
  debtToGdp: number | null;
  povertyRate: number | null;
  unemploymentRate: number | null;
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
  stability: 0,
  warSupport: 0,
  manpower: 0,
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
  const economy = snapshot?.economy ?? null;
  const capacity = snapshot?.productionCapacity ?? null;
  const gdp = economy?.gdp ?? null;
  const debt = economy?.national_debt ?? null;
  return {
    ...ZERO_PLAY_SIMULATION_STATE,
    countryKey: country.key,
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
    graphs: { ...ZERO_PLAY_SIMULATION_STATE.graphs },
    isPlaceholder: !snapshot?.economy,
    dataStatus: snapshot ? snapshot.readiness.toLowerCase() as PlaySimulationState["dataStatus"] : "unconfigured",
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
