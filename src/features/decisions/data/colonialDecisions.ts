export type ColonialEffectUnit = "relative_percent" | "percentage_point" | "stage";

export type ColonialEffectKey =
  | "resource_production"
  | "national_income"
  | "tax_collection_efficiency"
  | "stability"
  | "poverty_rate"
  | "living_standard_stage"
  | "production_capacity_modifier"
  | "construction_speed"
  | "political_power_gain_modifier"
  | "available_manpower"
  | "budget_fulfillment_rate"
  | "food_production";

export type ColonialEffect = {
  key: ColonialEffectKey;
  value: number;
  unit: ColonialEffectUnit;
};

export type ColonialCondition =
  | { metric: "stability" | "poverty_rate"; operator: "lte" | "gte"; value: number; label: string }
  | { metric: "relief_frozen"; operator: "eq"; value: 1; label: string };

export type ColonialDecisionDefinition = {
  id: string;
  title: string;
  description: string;
  icon: string;
  politicalPowerCost: number;
  cooldownTurns: number;
  durationTurns?: number;
  conditions?: readonly ColonialCondition[];
  immediateEffects?: readonly ColonialEffect[];
  temporaryEffects?: readonly ColonialEffect[];
  action?:
    | { type: "policy_level"; policyId: string; delta: -1 | 1 }
    | { type: "admin_network"; delta: 1 }
    | { type: "relief_freeze"; value: boolean };
};

export type ColonialPolicyDefinition = {
  id: string;
  title: string;
  initialLevel: number;
  minimumLevel: number;
  maximumLevel: number;
  effectsPerLevel: readonly ColonialEffect[];
  increaseDecisionId: string;
  decreaseDecisionId: string;
};

export type ColonialDecisionCategory = {
  countryKey: string;
  key: string;
  title: string;
  description: string;
  headerAssetKey: string;
  headerImage: string | null;
  baseEffects: readonly ColonialEffect[];
  policies?: readonly ColonialPolicyDefinition[];
  decisions: readonly ColonialDecisionDefinition[];
};

export type ColonialDecisionState = {
  policyLevels: Record<string, number>;
  adminNetworkLevel: number;
  reliefFrozen: boolean;
};

export type ColonialDecisionView = ColonialDecisionDefinition & {
  available: boolean;
  unmetConditions: string[];
  cooldownRemaining: number;
};

export type ColonialDecisionOverview = {
  mode: "colonial";
  countryKey: string;
  worldDate: string;
  turn: number;
  politicalPower: number | null;
  category: Omit<ColonialDecisionCategory, "decisions">;
  state: ColonialDecisionState;
  decisions: ColonialDecisionView[];
  appliedEffects: ColonialEffect[];
  activeModifiers: Array<{ decisionId: string; label: string; value: number; unit: string; turnsRemaining: number }>;
};

const ICON_ROOT = "/assets/ui/generated-icons/stages";
const effect = (key: ColonialEffectKey, value: number, unit: ColonialEffectUnit = "relative_percent"): ColonialEffect => ({ key, value, unit });

const congoPolicies: readonly ColonialPolicyDefinition[] = [
  { id: "mining_quota", title: "채굴 할당량", initialLevel: 1, minimumLevel: 0, maximumLevel: 3, effectsPerLevel: [effect("resource_production", 5), effect("national_income", 2.5), effect("stability", -2.5, "percentage_point"), effect("poverty_rate", 1.5, "percentage_point")], increaseDecisionId: "congo_mining_increase", decreaseDecisionId: "congo_mining_decrease" },
  { id: "forced_labor", title: "노동 징발", initialLevel: 1, minimumLevel: 0, maximumLevel: 3, effectsPerLevel: [effect("production_capacity_modifier", 5), effect("construction_speed", 2.5), effect("stability", -2.5, "percentage_point"), effect("poverty_rate", 1.5, "percentage_point")], increaseDecisionId: "congo_labor_increase", decreaseDecisionId: "congo_labor_decrease" },
  { id: "poll_tax", title: "인두세", initialLevel: 1, minimumLevel: 0, maximumLevel: 3, effectsPerLevel: [effect("tax_collection_efficiency", 5), effect("national_income", 2.5), effect("poverty_rate", 2, "percentage_point"), effect("stability", -2, "percentage_point")], increaseDecisionId: "congo_tax_increase", decreaseDecisionId: "congo_tax_decrease" },
  { id: "company_rule", title: "회사 통치권", initialLevel: 1, minimumLevel: 0, maximumLevel: 3, effectsPerLevel: [effect("resource_production", 2.5), effect("production_capacity_modifier", 2.5), effect("political_power_gain_modifier", -5), effect("stability", -2, "percentage_point")], increaseDecisionId: "congo_company_increase", decreaseDecisionId: "congo_company_decrease" },
] as const;

const congoDecisions: readonly ColonialDecisionDefinition[] = [
  { id: "congo_mining_increase", title: "채굴 할당량 증대", description: "광산별 채굴 목표를 높여 본국으로 보내는 자원을 늘립니다.", icon: `${ICON_ROOT}/economy/industry-ownership-5.png`, politicalPowerCost: 50, cooldownTurns: 0, action: { type: "policy_level", policyId: "mining_quota", delta: 1 } },
  { id: "congo_mining_decrease", title: "채굴 할당량 축소", description: "과도한 채굴 목표를 낮춰 현지의 부담을 완화합니다.", icon: `${ICON_ROOT}/economy/industry-ownership-2.png`, politicalPowerCost: 35, cooldownTurns: 0, action: { type: "policy_level", policyId: "mining_quota", delta: -1 } },
  { id: "congo_labor_increase", title: "노동 징발 확대", description: "광산과 건설현장에 동원되는 노동력을 확대합니다.", icon: `${ICON_ROOT}/political/forced-labor-1.png`, politicalPowerCost: 50, cooldownTurns: 0, action: { type: "policy_level", policyId: "forced_labor", delta: 1 } },
  { id: "congo_labor_decrease", title: "노동 징발 축소", description: "강제적인 노동 동원의 규모를 줄입니다.", icon: `${ICON_ROOT}/political/forced-labor-4.png`, politicalPowerCost: 35, cooldownTurns: 0, action: { type: "policy_level", policyId: "forced_labor", delta: -1 } },
  { id: "congo_tax_increase", title: "인두세 인상", description: "현지 주민에게 부과하는 인두세를 인상합니다.", icon: `${ICON_ROOT}/economy/income-tax-5.png`, politicalPowerCost: 40, cooldownTurns: 0, action: { type: "policy_level", policyId: "poll_tax", delta: 1 } },
  { id: "congo_tax_decrease", title: "인두세 인하", description: "현지 주민의 직접 조세 부담을 낮춥니다.", icon: `${ICON_ROOT}/economy/income-tax-2.png`, politicalPowerCost: 30, cooldownTurns: 0, action: { type: "policy_level", policyId: "poll_tax", delta: -1 } },
  { id: "congo_company_increase", title: "회사 통치권 확대", description: "특허회사가 행정과 생산을 직접 통제할 권한을 확대합니다.", icon: `${ICON_ROOT}/economy/industry-ownership-5.png`, politicalPowerCost: 60, cooldownTurns: 0, action: { type: "policy_level", policyId: "company_rule", delta: 1 } },
  { id: "congo_company_decrease", title: "회사 통치권 회수", description: "특허회사에 넘겨진 통치 권한 일부를 행정청으로 회수합니다.", icon: `${ICON_ROOT}/economy/industry-ownership-3.png`, politicalPowerCost: 50, cooldownTurns: 0, action: { type: "policy_level", policyId: "company_rule", delta: -1 } },
  { id: "congo_admin_network", title: "현지 행정망 확충", description: "현지 행정조직과 징세망을 한 단계 확장합니다.", icon: `${ICON_ROOT}/political/party-system-5.png`, politicalPowerCost: 100, cooldownTurns: 0, action: { type: "admin_network", delta: 1 } },
  { id: "congo_relief", title: "현지 구호사업 확대", description: "광산지대와 농촌에 긴급 식량과 의료 구호를 제공합니다.", icon: `${ICON_ROOT}/social/healthcare-4.png`, politicalPowerCost: 75, cooldownTurns: 3, durationTurns: 3, conditions: [{ metric: "poverty_rate", operator: "gte", value: 15, label: "빈곤율 15% 이상 필요" }], immediateEffects: [effect("poverty_rate", -3, "percentage_point"), effect("stability", 5, "percentage_point")], temporaryEffects: [effect("national_income", -5), effect("resource_production", -5)] },
] as const;

export const COLONIAL_DECISION_CATEGORIES: readonly ColonialDecisionCategory[] = [
  {
    countryKey: "country-051", key: "colonial_congo_exploitation", title: "콩고 착취체제",
    description: "콩고의 행정과 경제는 현지 사회의 발전보다\n본국과 특허회사가 원하는 자원을 최대한 많이 추출하는 데 맞춰져 있습니다.\n광산, 조세, 노동징발과 회사 통치는 막대한 수익을 만들어내지만,\n그 대가는 대부분 현지 주민들에게 전가되고 있습니다.",
    headerAssetKey: "belgian_congo_header", headerImage: "/assets/decisions/colonial/belgian_congo_header.png",
    baseEffects: [effect("resource_production", 15), effect("national_income", 10), effect("tax_collection_efficiency", 10), effect("stability", -10, "percentage_point"), effect("poverty_rate", 10, "percentage_point"), effect("living_standard_stage", -1, "stage")],
    policies: congoPolicies, decisions: congoDecisions,
  },
  {
    countryKey: "country-058", key: "governorate_emergency_rule", title: "총독부 비상통치",
    description: "인도는 제국 최대의 인구와 막대한 경제적 잠재력을 가진 영토지만,\n총독부는 이를 독자적인 사회로 육성하기보다 제국을 유지하는 자원으로 보고 있습니다.\n세금, 곡물, 노동력과 병력은 필요에 따라 동원되며,\n저항이 발생한 지역에는 타협보다 비상통치가 먼저 적용됩니다.",
    headerAssetKey: "british_india_header", headerImage: null,
    baseEffects: [effect("national_income", 15), effect("tax_collection_efficiency", 15), effect("available_manpower", 10), effect("stability", -15, "percentage_point"), effect("poverty_rate", 15, "percentage_point"), effect("living_standard_stage", -2, "stage")],
    decisions: [
      { id: "india_grain_requisition", title: "곡물 우선징발", description: "곡물 생산을 제국 수요에 우선 배정합니다.", icon: `${ICON_ROOT}/economy/land-system-3.png`, politicalPowerCost: 75, cooldownTurns: 4, durationTurns: 3, immediateEffects: [effect("poverty_rate", 3, "percentage_point"), effect("stability", -2.5, "percentage_point")], temporaryEffects: [effect("food_production", 15), effect("national_income", 10)] },
      { id: "india_revenue_quota", title: "세입 할당량 증액", description: "지방별 세입 할당량을 높입니다.", icon: `${ICON_ROOT}/economy/income-tax-5.png`, politicalPowerCost: 75, cooldownTurns: 4, durationTurns: 3, immediateEffects: [effect("poverty_rate", 3, "percentage_point"), effect("stability", -5, "percentage_point")], temporaryEffects: [effect("national_income", 10), effect("tax_collection_efficiency", 10)] },
      { id: "india_emergency_decree", title: "총독부 비상령 확대", description: "불안지역에 총독부의 비상권한을 확대합니다.", icon: `${ICON_ROOT}/political/assembly-1.png`, politicalPowerCost: 100, cooldownTurns: 5, durationTurns: 3, conditions: [{ metric: "stability", operator: "lte", value: 70, label: "안정도 70% 이하 필요" }], immediateEffects: [effect("stability", 7.5, "percentage_point")], temporaryEffects: [effect("political_power_gain_modifier", 10), effect("national_income", -5)] },
      { id: "india_collective_responsibility", title: "지방 연좌책임 확대", description: "저항 발생 지역 전체에 연좌책임을 적용합니다.", icon: `${ICON_ROOT}/political/assembly-2.png`, politicalPowerCost: 100, cooldownTurns: 5, durationTurns: 3, conditions: [{ metric: "stability", operator: "lte", value: 60, label: "안정도 60% 이하 필요" }], temporaryEffects: [effect("tax_collection_efficiency", 10), effect("stability", 5, "percentage_point"), effect("poverty_rate", 2.5, "percentage_point")] },
      { id: "india_movement_restrictions", title: "농촌 이동제한 강화", description: "농촌 인구의 이동과 이탈을 제한합니다.", icon: `${ICON_ROOT}/political/immigration-1.png`, politicalPowerCost: 75, cooldownTurns: 4, durationTurns: 3, temporaryEffects: [effect("available_manpower", 5), effect("production_capacity_modifier", 5), effect("stability", -2.5, "percentage_point"), effect("living_standard_stage", -1, "stage")] },
      { id: "india_special_tribunals", title: "특별재판소 확대", description: "식민정부에 저항하는 사건을 다룰 특별재판소를 확대합니다.", icon: `${ICON_ROOT}/political/assembly-1.png`, politicalPowerCost: 100, cooldownTurns: 5, durationTurns: 3, conditions: [{ metric: "stability", operator: "lte", value: 65, label: "안정도 65% 이하 필요" }], immediateEffects: [effect("stability", 5, "percentage_point")], temporaryEffects: [effect("political_power_gain_modifier", 5), effect("poverty_rate", 2.5, "percentage_point")] },
      { id: "india_relief_freeze", title: "구호예산 동결", description: "지방 구호예산을 동결해 총독부 재정을 확보합니다.", icon: `${ICON_ROOT}/social/healthcare-1.png`, politicalPowerCost: 50, cooldownTurns: 4, durationTurns: 3, immediateEffects: [effect("budget_fulfillment_rate", 10, "percentage_point")], temporaryEffects: [effect("poverty_rate", 4, "percentage_point"), effect("stability", -2.5, "percentage_point")], action: { type: "relief_freeze", value: true } },
      { id: "india_relief_restore", title: "구호예산 복원", description: "동결했던 구호예산을 복원하고 지방 지원을 재개합니다.", icon: `${ICON_ROOT}/social/healthcare-5.png`, politicalPowerCost: 125, cooldownTurns: 5, conditions: [{ metric: "relief_frozen", operator: "eq", value: 1, label: "빈곤율 20% 이상 또는 구호예산 동결 상태 필요" }], immediateEffects: [effect("poverty_rate", -4, "percentage_point"), effect("stability", 5, "percentage_point"), effect("living_standard_stage", 1, "stage"), effect("budget_fulfillment_rate", -10, "percentage_point")], action: { type: "relief_freeze", value: false } },
      { id: "india_requisition_reduce", title: "징발량 축소", description: "지방의 곡물과 생산물 징발량을 일시적으로 줄입니다.", icon: `${ICON_ROOT}/economy/land-system-4.png`, politicalPowerCost: 100, cooldownTurns: 4, durationTurns: 3, immediateEffects: [effect("stability", 5, "percentage_point"), effect("poverty_rate", -2.5, "percentage_point")], temporaryEffects: [effect("national_income", -10)] },
    ],
  },
  {
    countryKey: "country-061", key: "south_africa_racial_order", title: "인종질서",
    description: "남아프리카 연방의 행정과 산업은 비교적 안정적으로 작동하고 있지만,\n그 질서는 모든 주민에게 동일하게 적용되지 않습니다.\n토지, 이동, 직업과 정치적 권리에는 인종에 따른 명확한 경계가 존재하며,\n광산과 농업경제는 값싼 비백인 노동력과 백인 노동자의 특권을 동시에 유지하는 데 의존하고 있습니다.",
    headerAssetKey: "south_africa_header", headerImage: null,
    baseEffects: [effect("national_income", 5), effect("tax_collection_efficiency", 5), effect("available_manpower", -10), effect("poverty_rate", 5, "percentage_point"), effect("living_standard_stage", -1, "stage")],
    decisions: [
      { id: "sa_pass_enforcement", title: "통행증 단속 강화", description: "비백인 주민의 통행증 검사와 단속을 강화합니다.", icon: `${ICON_ROOT}/political/immigration-2.png`, politicalPowerCost: 75, cooldownTurns: 4, durationTurns: 3, temporaryEffects: [effect("production_capacity_modifier", 5), effect("tax_collection_efficiency", 5), effect("poverty_rate", 2, "percentage_point"), effect("stability", -2.5, "percentage_point")] },
      { id: "sa_mining_color_bar", title: "광산 색깔장벽 강화", description: "광산 직종의 인종별 고용 장벽을 강화합니다.", icon: `${ICON_ROOT}/social/womens-rights-2.png`, politicalPowerCost: 75, cooldownTurns: 4, durationTurns: 3, temporaryEffects: [effect("stability", 2.5, "percentage_point"), effect("production_capacity_modifier", -5)] },
      { id: "sa_land_restrictions", title: "토지구역 제한 확대", description: "인종별 토지 소유와 거주구역 제한을 확대합니다.", icon: `${ICON_ROOT}/political/immigration-1.png`, politicalPowerCost: 100, cooldownTurns: 5, durationTurns: 3, temporaryEffects: [effect("national_income", 5), effect("food_production", 5), effect("poverty_rate", 3, "percentage_point"), effect("stability", -2.5, "percentage_point")] },
      { id: "sa_urban_segregation", title: "도시 거주구역 분리 확대", description: "도시의 인종별 거주구역 분리를 확대합니다.", icon: `${ICON_ROOT}/political/immigration-2.png`, politicalPowerCost: 75, cooldownTurns: 4, durationTurns: 3, immediateEffects: [effect("stability", 2.5, "percentage_point")], temporaryEffects: [effect("construction_speed", -5), effect("poverty_rate", 2, "percentage_point")] },
      { id: "sa_union_restrictions", title: "비백인 노동조합 제한", description: "비백인 노동자의 노동조합 활동을 제한합니다.", icon: `${ICON_ROOT}/political/trade-unions-1.png`, politicalPowerCost: 75, cooldownTurns: 4, durationTurns: 3, temporaryEffects: [effect("production_capacity_modifier", 5), effect("national_income", 5), effect("stability", -5, "percentage_point")] },
      { id: "sa_pass_relaxation", title: "통행증 단속 완화", description: "통행증 단속을 일부 완화합니다.", icon: `${ICON_ROOT}/political/immigration-4.png`, politicalPowerCost: 100, cooldownTurns: 4, durationTurns: 3, immediateEffects: [effect("stability", 2.5, "percentage_point"), effect("poverty_rate", -1.5, "percentage_point")], temporaryEffects: [effect("production_capacity_modifier", -2.5)] },
      { id: "sa_color_bar_relaxation", title: "직업 색깔장벽 완화", description: "숙련직과 산업 직종의 인종 장벽을 일부 완화합니다.", icon: `${ICON_ROOT}/social/womens-rights-4.png`, politicalPowerCost: 100, cooldownTurns: 5, durationTurns: 3, immediateEffects: [effect("stability", -5, "percentage_point")], temporaryEffects: [effect("production_capacity_modifier", 7.5), effect("national_income", 5)] },
      { id: "sa_land_review", title: "토지규제 재검토", description: "인종별 토지규제의 범위와 집행방식을 재검토합니다.", icon: `${ICON_ROOT}/political/immigration-5.png`, politicalPowerCost: 125, cooldownTurns: 5, immediateEffects: [effect("poverty_rate", -3, "percentage_point"), effect("living_standard_stage", 1, "stage"), effect("stability", -5, "percentage_point")] },
    ],
  },
] as const;

export const COLONIAL_EFFECT_LABELS: Record<ColonialEffectKey, string> = {
  resource_production: "자원 생산량",
  national_income: "국가 수입",
  tax_collection_efficiency: "조세 효율",
  stability: "안정도",
  poverty_rate: "빈곤율",
  living_standard_stage: "생활 수준",
  production_capacity_modifier: "생산 능력",
  construction_speed: "건설 속도",
  political_power_gain_modifier: "정치력 획득",
  available_manpower: "가용 인력",
  budget_fulfillment_rate: "예산 충족률",
  food_production: "식량 생산량",
};

export const COLONIAL_STAGE_LABELS = ["완화", "표준", "강화", "극단"] as const;

export function getColonialDecisionCategory(countryKey: string): ColonialDecisionCategory | null {
  return COLONIAL_DECISION_CATEGORIES.find((category) => category.countryKey === countryKey) ?? null;
}

export function createInitialColonialState(category: ColonialDecisionCategory): ColonialDecisionState {
  return {
    policyLevels: Object.fromEntries((category.policies ?? []).map((policy) => [policy.id, policy.initialLevel])),
    adminNetworkLevel: 0,
    reliefFrozen: false,
  };
}

export function aggregateColonialEffects(category: ColonialDecisionCategory, state: ColonialDecisionState): ColonialEffect[] {
  const totals = new Map<string, ColonialEffect>();
  const add = (item: ColonialEffect, multiplier = 1) => {
    const id = `${item.key}:${item.unit}`;
    const current = totals.get(id);
    totals.set(id, { ...item, value: (current?.value ?? 0) + item.value * multiplier });
  };
  category.baseEffects.forEach((item) => add(item));
  for (const policy of category.policies ?? []) {
    const level = state.policyLevels[policy.id] ?? policy.initialLevel;
    policy.effectsPerLevel.forEach((item) => add(item, level));
  }
  if (state.adminNetworkLevel > 0) {
    [effect("available_manpower", 5), effect("tax_collection_efficiency", 5), effect("national_income", 2.5), effect("budget_fulfillment_rate", -5, "percentage_point")]
      .forEach((item) => add(item, state.adminNetworkLevel));
  }
  return [...totals.values()].filter((item) => item.value !== 0);
}

export function formatColonialEffect(item: ColonialEffect): string {
  const suffix = item.unit === "percentage_point" ? "%p" : item.unit === "stage" ? "단계" : "%";
  return `${COLONIAL_EFFECT_LABELS[item.key]} ${item.value > 0 ? "+" : ""}${item.value}${suffix}`;
}
