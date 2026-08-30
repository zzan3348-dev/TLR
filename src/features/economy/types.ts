export type EconomyReadiness = "UNCONFIGURED" | "PARTIAL" | "READY";

export type EconomyRecord = {
  country_key: string;
  gdp: number | null;
  per_capita_gdp: number | null;
  nominal_growth_rate: number | null;
  real_growth_rate: number | null;
  inflation_rate: number | null;
  unemployment_rate: number | null;
  poverty_rate: number | null;
  poverty_rate_change: number | null;
  total_population: number | null;
  working_age_population: number | null;
  employed_population: number | null;
  unemployed_population: number | null;
  urban_population_rate: number | null;
  rural_population_rate: number | null;
  literacy_rate: number | null;
  life_expectancy: number | null;
  economic_system: string | null;
  economic_bloc: string | null;
  credit_rating: string | null;
  bond_interest_rate: number | null;
  national_debt: number | null;
  debt_to_gdp_rate: number | null;
  foreign_reserves: number | null;
  national_income: number | null;
  total_expenditure: number | null;
  fiscal_balance: number | null;
  base_production_capacity: number | null;
  production_capacity_modifier: number | null;
  domestic_capacity_used: number | null;
  trade_capacity_provided: number | null;
  trade_capacity_received: number | null;
  available_production_capacity: number | null;
  research_capacity: number | null;
  budget_fulfillment_rate: number | null;
  nominal_tax_rate: number | null;
  tax_collection_efficiency: number | null;
  economic_crisis_signal: string | null;
  industrial_structure: Record<string, number> | null;
  operating_costs: Record<string, number> | null;
  current_budget: Record<string, number> | null;
  draft_budget: Record<string, number> | null;
  next_budget: Record<string, number> | null;
  next_budget_world_date: string | null;
};

export type ResourceRecord = {
  country_key: string;
  resource_type_id: TradeResourceId;
  stockpile: number | null;
  production_per_period: number | null;
  domestic_use: number | null;
  export_limit: number | null;
  is_public: boolean;
  available?: number | null;
};

export type CapacityRecord = {
  effective_capacity: number;
  domestic_used: number;
  committed_out: number;
  received_in: number;
  available: number;
};

export type NationalStatsRecord = {
  basePoliticalPower: number;
  politicalPower: number;
  basePoliticalPowerPerTurn: number;
  politicalPowerPerTurn: number;
  politicalPowerGainModifier: number;
  baseStability: number;
  stability: number;
  stabilityModifierPoints: number;
  baseWarSupport: number;
  warSupport: number;
  warSupportModifierPoints: number;
  baseAvailableManpower: number;
  manpowerModifierPercent: number;
  mobilizableManpower: number;
  activeMilitaryManpower: number;
  availableManpower: number;
  reservedManpower: number;
  modifierBreakdown: Array<{
    key: "available_manpower" | "stability" | "war_support" | "political_power_gain";
    value: number;
    unit: "relative_percent" | "percentage_point";
    sourceType: "law" | "national_spirit" | "decision";
    sourceId: string;
    label: string;
  }>;
};

export type EconomySnapshot = {
  countryKey: string;
  worldDate: string;
  readiness: EconomyReadiness;
  economy: EconomyRecord | null;
  productionCapacity: CapacityRecord | null;
  nationalStats: NationalStatsRecord | null;
  atWar: boolean;
  resources: ResourceRecord[];
  history: Array<Record<string, unknown>>;
  rules: { settlement_interval_days: number; budget_min: number; budget_max: number; budget_step: number };
};

export type TradeResourceId = "STEEL" | "OIL" | "COAL" | "FOOD" | "RARE_MINERALS";
export type TradeAssetType = "RESOURCE" | "PRODUCTION_CAPACITY";

export type TradeCountrySummary = {
  countryKey: string;
  readiness: EconomyReadiness;
  reviewRoute: "PLAYER" | "ADMIN";
  productionCapacity: CapacityRecord[] | CapacityRecord | null;
  resources: ResourceRecord[];
  updatedAt: string | null;
};

export type TradeLine = {
  fromCountryKey: string;
  toCountryKey: string;
  assetType: TradeAssetType;
  resourceTypeId: TradeResourceId | null;
  amount: number;
};

export type TradeProposal = {
  id: string;
  proposer_country_key: string;
  receiver_country_key: string;
  status: string;
  review_route: "PLAYER" | "ADMIN";
  proposed_start_world_date: string;
  proposed_end_world_date: string;
  response_deadline_world_date: string;
  settlement_interval_days: number;
  lines: Array<{ id: number; from_country_key: string; to_country_key: string; asset_type: TradeAssetType; resource_type_id: TradeResourceId | null; amount_per_settlement: number }>;
};

export type TradeAgreement = {
  id: string;
  country_a_key: string;
  country_b_key: string;
  status: string;
  starts_world_date: string;
  ends_world_date: string;
  next_settlement_world_date: string | null;
  allow_early_termination: boolean;
  lines: TradeProposal["lines"];
};

export type TradeNotification = {
  id: string;
  country_key: string;
  counterpart_country_key: string;
  notification_type: "PROPOSAL_RECEIVED" | "PROPOSAL_ACCEPTED" | "PROPOSAL_REJECTED" | "AGREEMENT_BREACHED" | "AGREEMENT_TERMINATED";
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  proposal: TradeProposal | null;
  agreement: TradeAgreement | null;
};

export const RESOURCE_LABELS: Record<TradeResourceId, string> = {
  STEEL: "철강", OIL: "석유", COAL: "석탄", FOOD: "식량", RARE_MINERALS: "희귀광물",
};
