import type { MapCountryIndex } from "../../../types/mapCountry";

export type ProductionCapacity = {
  total: number;
  used: number;
  fromDomesticEconomy: number;
  fromTrade: number;
  other: number;
};

export type PlaySimulationState = {
  countryKey: string;
  politicalPower: number;
  politicalPowerChange: number;
  stability: number;
  warSupport: number;
  manpower: number;
  productionCapacity: ProductionCapacity;
  gdp: number;
  nominalGrowth: number;
  inflation: number;
  realGrowth: number;
  debt: number;
  debtToGdp: number;
  povertyRate: number;
  unemploymentRate: number;
  graphs: {
    gdp: readonly number[];
    inflation: readonly number[];
    debtRatio: readonly number[];
    poverty: readonly number[];
  };
  isPlaceholder: true;
  dataStatus: "placeholder";
};

export const ZERO_PLAY_SIMULATION_STATE: PlaySimulationState = {
  countryKey: "__placeholder__",
  politicalPower: 0,
  politicalPowerChange: 0,
  stability: 0,
  warSupport: 0,
  manpower: 0,
  productionCapacity: {
    total: 0,
    used: 0,
    fromDomesticEconomy: 0,
    fromTrade: 0,
    other: 0,
  },
  gdp: 0,
  nominalGrowth: 0,
  inflation: 0,
  realGrowth: 0,
  debt: 0,
  debtToGdp: 0,
  povertyRate: 0,
  unemploymentRate: 0,
  graphs: {
    gdp: [0, 0, 0, 0, 0, 0],
    inflation: [0, 0, 0, 0, 0, 0],
    debtRatio: [0, 0, 0, 0, 0, 0],
    poverty: [0, 0, 0, 0, 0, 0],
  },
  isPlaceholder: true,
  dataStatus: "placeholder",
};

export function getPlaySimulationState(
  country: MapCountryIndex,
): PlaySimulationState {
  return {
    ...ZERO_PLAY_SIMULATION_STATE,
    countryKey: country.key,
    productionCapacity: { ...ZERO_PLAY_SIMULATION_STATE.productionCapacity },
    graphs: { ...ZERO_PLAY_SIMULATION_STATE.graphs },
  };
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function formatBillions(value: number): string {
  return `$${value.toFixed(2)}B`;
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

