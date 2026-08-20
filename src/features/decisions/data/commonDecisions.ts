export type DecisionCategoryId = "political" | "economy" | "wartime";

export type DecisionTargetKind = "party" | "nonRulingParty";

export type CommonDecisionDefinition = {
  id: string;
  category: DecisionCategoryId;
  title: string;
  description: string;
  icon: string;
  politicalPowerCost: number;
  conditions: readonly string[];
  effects: readonly string[];
  cooldownTurns: number;
  durationTurns?: number;
  targetSelector?: DecisionTargetKind;
  visibilityCondition?: "atWar" | "hasNonRulingParty" | "hasParty";
};

export const DECISION_CATEGORY_LABELS: Record<DecisionCategoryId, string> = {
  political: "정치적 행동",
  economy: "경제 및 사회정책",
  wartime: "전시 조치",
};

export const COMMON_DECISIONS: readonly CommonDecisionDefinition[] = [
  {
    id: "ideology_repression", category: "political", title: "[사상] 탄압",
    description: "집권 세력에 맞서는 특정 정당의 조직과 선전을 억제합니다.",
    icon: "/assets/ui/generated-icons/stages/political/press-1.png", politicalPowerCost: 75,
    conditions: ["집권 정당이 아닌 실제 정당", "대상 정당 지지도 5% 이상"],
    effects: ["대상 정당 지지도 -3.0%p", "안정도 -2.5%p"], cooldownTurns: 3,
    targetSelector: "nonRulingParty", visibilityCondition: "hasNonRulingParty",
  },
  {
    id: "ideology_propaganda", category: "political", title: "[사상] 선전운동",
    description: "선택한 정당의 노선을 전국적으로 선전합니다.",
    icon: "/assets/ui/generated-icons/stages/political/press-5.png", politicalPowerCost: 75,
    conditions: ["실제 정당 선택"], effects: ["대상 정당 지지도 +3.0%p", "전체 지지도 합계 100% 이하로 정규화"],
    cooldownTurns: 3, targetSelector: "party", visibilityCondition: "hasParty",
  },
  {
    id: "crackdown_political_violence", category: "political", title: "정치적 폭력 단속",
    description: "거리의 정치 폭력과 무장 충돌을 집중적으로 단속합니다.",
    icon: "/assets/ui/generated-icons/stages/political/assembly-1.png", politicalPowerCost: 100,
    conditions: ["안정도 60% 이하"], effects: ["안정도 +5.0%p", "3턴 동안 정치력 획득 -10%"],
    cooldownTurns: 4, durationTurns: 3,
  },
  {
    id: "peace_propaganda", category: "political", title: "평화 선전",
    description: "전쟁 열기를 가라앉히고 국내의 평화 여론을 결집합니다.",
    icon: "/assets/ui/generated-icons/stages/military/training-2.png", politicalPowerCost: 75,
    conditions: ["전쟁 중이 아님", "전쟁 지지도 30% 이상"], effects: ["안정도 +5.0%p", "전쟁 지지도 -7.5%p"],
    cooldownTurns: 4,
  },
  {
    id: "improve_labor_conditions", category: "economy", title: "노동 환경 개선",
    description: "노동자의 생활과 작업 환경을 개선하는 전국 정책을 시행합니다.",
    icon: "/assets/ui/generated-icons/stages/political/trade-unions-5.png", politicalPowerCost: 100,
    conditions: ["전쟁 중이 아님", "생활 수준이 최고 단계가 아님"],
    effects: ["안정도 +5.0%p", "생활 수준 +1단계", "3턴 동안 생산 능력 -7.5%"], cooldownTurns: 5, durationTurns: 3,
  },
  {
    id: "austerity", category: "economy", title: "긴축재정",
    description: "정부 지출을 줄여 재정의 급한 불을 끕니다.",
    icon: "/assets/ui/generated-icons/stages/economy/income-tax-4.png", politicalPowerCost: 75,
    conditions: ["추가 조건 없음"], effects: ["3턴 동안 예산 충족률 +10.0%p", "3턴 동안 명목 성장률 -0.5%p", "안정도 -5.0%p"],
    cooldownTurns: 4, durationTurns: 3,
  },
  {
    id: "public_works", category: "economy", title: "공공사업",
    description: "대규모 공공사업으로 실업을 줄이고 경기를 부양합니다.",
    icon: "/assets/ui/generated-icons/stages/economy/unemployment-5.png", politicalPowerCost: 125,
    conditions: ["실업률 2% 이상"], effects: ["실업률 -1.5%p", "3턴 동안 명목 성장률 +0.5%p", "3턴 동안 예산 충족률 -10.0%p"],
    cooldownTurns: 5, durationTurns: 3,
  },
  {
    id: "emergency_relief", category: "economy", title: "긴급구호",
    description: "빈곤층에 식량과 필수품을 긴급 지원합니다.",
    icon: "/assets/ui/generated-icons/laws/healthcare.png", politicalPowerCost: 100,
    conditions: ["빈곤율 10% 이상"], effects: ["빈곤율 -2.5%p", "안정도 +3.0%p", "3턴 동안 예산 충족률 -7.5%p"],
    cooldownTurns: 5, durationTurns: 3,
  },
  {
    id: "special_tax", category: "economy", title: "특별세",
    description: "한시적인 특별세를 부과해 국가 수입을 확보합니다.",
    icon: "/assets/ui/generated-icons/stages/economy/income-tax-5.png", politicalPowerCost: 75,
    conditions: ["추가 조건 없음"], effects: ["안정도 -5.0%p", "3턴 동안 국가 수입 +10%", "3턴 동안 명목 성장률 -0.25%p"],
    cooldownTurns: 4, durationTurns: 3,
  },
  {
    id: "corporate_tax_benefits", category: "economy", title: "기업 세제혜택",
    description: "기업의 투자와 생산 확대를 유도하는 세제혜택을 제공합니다.",
    icon: "/assets/ui/generated-icons/stages/economy/industry-ownership-4.png", politicalPowerCost: 75,
    conditions: ["추가 조건 없음"], effects: ["3턴 동안 생산 능력 +7.5%", "3턴 동안 명목 성장률 +0.5%p", "3턴 동안 조세 효율 -10%"],
    cooldownTurns: 4, durationTurns: 3,
  },
  {
    id: "research_subsidies", category: "economy", title: "연구보조금",
    description: "연구기관과 산업 연구에 국가 보조금을 투입합니다.",
    icon: "/assets/ui/generated-icons/research/laboratory.png", politicalPowerCost: 100,
    conditions: ["추가 조건 없음"], effects: ["3턴 동안 연구력 +10%", "3턴 동안 예산 충족률 -5.0%p"],
    cooldownTurns: 5, durationTurns: 3,
  },
  {
    id: "war_propaganda", category: "wartime", title: "전쟁선전",
    description: "전쟁의 당위성을 선전하고 국민의 결의를 끌어올립니다.",
    icon: "/assets/ui/generated-icons/stages/military/officers-3.png", politicalPowerCost: 100,
    conditions: ["전쟁 중"], effects: ["전쟁 지지도 +7.5%p"], cooldownTurns: 3, visibilityCondition: "atWar",
  },
  {
    id: "recruitment_campaign", category: "wartime", title: "모병운동",
    description: "대대적인 모병운동으로 가용 인력을 확충합니다.",
    icon: "/assets/ui/generated-icons/stages/military/service-3.png", politicalPowerCost: 100,
    conditions: ["전쟁 중 또는 전쟁 지지도 60% 이상"], effects: ["안정도 -2.5%p", "3턴 동안 가용 인력 +5%"],
    cooldownTurns: 4, durationTurns: 3,
  },
  {
    id: "total_mobilization_propaganda", category: "wartime", title: "국민 총동원 선전",
    description: "전 국민에게 전시 총동원의 필요성을 선전합니다.",
    icon: "/assets/ui/generated-icons/stages/military/service-5.png", politicalPowerCost: 150,
    conditions: ["전쟁 중", "전쟁 지지도 50% 이상"],
    effects: ["전쟁 지지도 +5.0%p", "안정도 -5.0%p", "3턴 동안 가용 인력 +10%", "3턴 동안 생산 능력 +5%"],
    cooldownTurns: 5, durationTurns: 3, visibilityCondition: "atWar",
  },
] as const;

export type DecisionPartyOption = {
  id: string;
  name: string;
  subIdeology: string;
  ideologyCategory: string;
  support: number;
  ruling: boolean;
};

export type DecisionView = CommonDecisionDefinition & {
  visible: boolean;
  available: boolean;
  unmetConditions: string[];
  cooldownRemaining: number;
  selectedTargetId?: string;
};

export type DecisionOverview = {
  countryKey: string;
  worldDate: string;
  turn: number;
  politicalPower: number | null;
  parties: DecisionPartyOption[];
  decisions: DecisionView[];
  activeModifiers: Array<{ decisionId: string; label: string; value: number; unit: string; turnsRemaining: number }>;
};
