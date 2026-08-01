import type { DevelopmentDefinition } from "../types/development";

const levelNames = (
  ...names: readonly string[]
): DevelopmentDefinition["levels"] =>
  names.map((name, index) => ({
    level: index + 1,
    name,
    modifiers: [],
  }));

export const developmentDefinitions: readonly DevelopmentDefinition[] = [
  {
    id: "academic-foundation",
    label: "학문적 기반",
    icon: "▥",
    levels: levelNames(
      "교육 기반 미비",
      "초등교육 보급",
      "중등교육 확장",
      "고등교육 체계",
      "대중 고등교육",
    ),
  },
  {
    id: "research-facilities",
    label: "연구 시설",
    icon: "⌬",
    levels: levelNames(
      "개인 연구실",
      "기초 연구기관",
      "고급 연구 시설",
      "국가 연구망",
      "첨단 연구단지",
    ),
  },
  {
    id: "agriculture",
    label: "농업 방식",
    icon: "♧",
    levels: levelNames(
      "생계형 농업",
      "전통 집약농업",
      "대규모 기계화",
      "과학적 농업",
      "고도 자동화",
    ),
  },
  {
    id: "health",
    label: "보건 수준",
    icon: "✚",
    levels: levelNames(
      "지역 구휼",
      "기초 보건망",
      "발전된 보건",
      "전국 의료망",
      "예방의학 체계",
    ),
  },
  {
    id: "administration",
    label: "행정 효율",
    icon: "▤",
    levels: levelNames(
      "파편화된 행정",
      "기초 관료제",
      "간결한 국가기구",
      "전문화된 행정",
      "통합 행정망",
    ),
  },
  {
    id: "industry-specialization",
    label: "산업 전문성",
    icon: "⚒",
    levels: levelNames(
      "가내 수공업",
      "초기 공장제",
      "효율적인 산업 방식",
      "전문화된 산업",
      "고도 분업 체계",
    ),
  },
  {
    id: "industrial-equipment",
    label: "공업 장비",
    icon: "▰",
    levels: levelNames(
      "수공업 중심",
      "초기 산업 장비",
      "표준 산업 장비",
      "현대 공업 장비",
      "첨단 산업 장비",
    ),
  },
  {
    id: "military-professionalism",
    label: "군 전문성",
    icon: "♜",
    levels: levelNames(
      "비정규 병력",
      "기초 상비군",
      "전문직업군",
      "통합 전문군",
      "고도 전문군",
    ),
  },
] as const;

export const developmentDefinitionById = new Map(
  developmentDefinitions.map((definition) => [definition.id, definition]),
);
