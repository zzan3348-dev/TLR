import type { IntelligenceCategory, IntelligenceDomain, IntelligenceUpgradeDefinition, SpyOperationDefinition } from "../types";

export const INTELLIGENCE_CATEGORY_LABELS: Record<IntelligenceCategory, string> = {
  INFORMATION: "정보", COUNTERINTELLIGENCE: "방첩", OPERATIONS: "작전", TRAINING: "공작원 훈련", CRYPTOGRAPHY: "암호",
};
export const INTELLIGENCE_CATEGORY_ICONS: Record<IntelligenceCategory, string> = {
  INFORMATION: "intelligence/agency", COUNTERINTELLIGENCE: "intelligence/defense", OPERATIONS: "intelligence/operation",
  TRAINING: "intelligence/training", CRYPTOGRAPHY: "intelligence/cipher",
};
export const INTELLIGENCE_DOMAIN_LABELS: Record<IntelligenceDomain, string> = {
  ECONOMY: "경제", ADMINISTRATION_POLITICS: "행정·정치", RESEARCH: "연구", MILITARY: "군사", UNDERGROUND: "지하조직",
};

type UpgradeSeed = [string, IntelligenceCategory, string, string, number, number, string];
const upgradeSeeds: UpgradeSeed[] = [
  ["political_network", "INFORMATION", "정치 정보망", "정당·관료조직 정보의 신뢰도와 수집 효율을 높입니다.", 35, 20, "law/party-system"],
  ["economic_network", "INFORMATION", "경제 정보망", "재정·무역 정보의 추정 범위를 좁힙니다.", 35, 20, "economy/trade"],
  ["diplomatic_network", "INFORMATION", "외교 정보망", "협정과 외교 활동의 정보 품질을 높입니다.", 40, 25, "diplomacy/intel"],
  ["industrial_network", "INFORMATION", "산업 정보망", "생산능력과 산업 정보 수집을 강화합니다.", 40, 25, "development/industry"],
  ["domestic_counter_network", "COUNTERINTELLIGENCE", "국내 방첩망", "적대 공작의 발각 가능성을 높입니다.", 40, 25, "intelligence/defense"],
  ["security_cooperation", "COUNTERINTELLIGENCE", "보안기관 협조", "발각된 공작의 배후 귀속 능력을 강화합니다.", 35, 20, "law/policing"],
  ["identity_screening", "COUNTERINTELLIGENCE", "신원검증", "위장 신분과 침투 자산을 찾아냅니다.", 35, 20, "law/registration-system"],
  ["counter_operation_system", "COUNTERINTELLIGENCE", "대공작 체계", "반복 작전 방어와 경계도 대응을 강화합니다.", 50, 30, "intelligence/operation"],
  ["institutional_infiltration", "OPERATIONS", "기관 침투", "행정·정치 침투와 관련 작전 준비를 개선합니다.", 45, 25, "law/assembly"],
  ["influence_operations", "OPERATIONS", "영향력 공작", "선전·허위정보 계열 작전 효율을 높입니다.", 45, 25, "law/press"],
  ["industrial_espionage", "OPERATIONS", "산업 첩보", "산업 사보타주와 설계도 탈취 준비를 개선합니다.", 50, 30, "law/industry-regulation"],
  ["sabotage_methods", "OPERATIONS", "사보타주", "시설 파괴 계열 작전의 준비 능력을 높입니다.", 55, 35, "military/battle-result"],
  ["language_training", "TRAINING", "언어 훈련", "현지 활동의 위장과 정보 신뢰도를 높입니다.", 30, 15, "law/education"],
  ["cover_identity", "TRAINING", "위장 신분", "발각 및 귀속 위험을 낮춥니다.", 35, 20, "law/immigration"],
  ["specialist_operations", "TRAINING", "전문공작", "침투 자산의 작전 기여도를 높입니다.", 45, 25, "law/training"],
  ["psychological_warfare", "TRAINING", "심리전", "선전과 지하조직 공작을 강화합니다.", 45, 25, "hud/war-support"],
  ["encryption", "CRYPTOGRAPHY", "암호화", "자국 통신 보안을 강화합니다.", 40, 25, "intelligence/cipher"],
  ["decryption", "CRYPTOGRAPHY", "암호 해독", "상대 정보 수집의 신뢰도를 높입니다.", 45, 25, "research/laboratory"],
  ["signals_interception", "CRYPTOGRAPHY", "신호 감청", "군사·외교 정보망의 수집 효율을 높입니다.", 50, 30, "diplomacy/message"],
  ["information_security", "CRYPTOGRAPHY", "정보 보안", "적의 정보 수집과 귀속 분석을 방해합니다.", 45, 25, "ui/lock"],
];

export const DEFAULT_INTELLIGENCE_UPGRADES: IntelligenceUpgradeDefinition[] = upgradeSeeds.map(([key, category, display_name, description, political_power_cost, duration_world_days, icon_asset_key]) => ({
  key, category, display_name, description, political_power_cost, duration_world_days, icon_asset_key,
  requirements: {}, modifiers: {}, publish_status: "PUBLISHED",
}));

type OperationSeed = [string, string, string, IntelligenceDomain, number, number, number, number, number, string];
const operationSeeds: OperationSeed[] = [
  ["blueprint_theft", "연구 설계도 탈취", "연구 자료를 확보하고 기존 이벤트 효과 후보로 넘깁니다.", "RESEARCH", 45, 1, 55, 18, 12, "research/laboratory"],
  ["industrial_sabotage", "산업 사보타주", "산업 시설 교란 결과를 관리자 검토와 이벤트 후보로 넘깁니다.", "ECONOMY", 45, 1, 60, 20, 14, "law/industry-regulation"],
  ["research_delay", "연구 지연", "대상 연구 체계의 지연 효과 후보를 만듭니다.", "RESEARCH", 35, 1, 50, 16, 10, "research/investment"],
  ["disinformation", "선전·허위정보", "대상국 여론에 대한 영향 공작 후보를 만듭니다.", "ADMINISTRATION_POLITICS", 30, 1, 45, 14, 8, "law/press"],
  ["support_resistance", "저항조직 지원", "현지 저항조직에 대한 지원을 준비합니다.", "UNDERGROUND", 40, 1, 55, 21, 14, "law/assembly"],
  ["collaboration_groundwork", "협력정부 기반 조성", "점령 이후 협력 행정 기반을 조성합니다.", "UNDERGROUND", 50, 2, 65, 28, 18, "diplomacy/alliance"],
  ["incite_rebellion", "반란 선동", "내전·반란 이벤트 후보를 생성하는 고위험 공작입니다.", "UNDERGROUND", 60, 2, 75, 35, 21, "hud/war-support"],
  ["coordinated_strikes", "동시타격 준비", "여러 거점의 동시 행동을 위한 기반을 준비합니다.", "MILITARY", 55, 2, 70, 30, 18, "military/army-map"],
  ["agent_rescue", "공작원 구출", "노출되거나 손실 위기에 놓인 자산을 회수합니다.", "MILITARY", 25, 1, 40, 10, 7, "intelligence/training"],
];

export const DEFAULT_SPY_OPERATIONS: SpyOperationDefinition[] = operationSeeds.map(([key, display_name, description, domain, infiltration, assets, political_power_cost, preparation_days, cooldown_days, icon_asset_key]) => ({
  key, display_name, description, icon_asset_key, operation_class: "MAJOR", requirements: { domain, infiltration, assets },
  political_power_cost, preparation_days, execution_days: Math.max(5, Math.round(preparation_days * .55)), extraction_days: Math.max(4, Math.round(preparation_days * .35)),
  base_difficulty: 50, base_detection_risk: 35, admin_review_mode: "REQUIRED", cooldown_days,
  result_hooks: { eventCandidate: true }, publish_status: "PUBLISHED",
}));
