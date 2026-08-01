import type {
  LawCategory,
  LawDefinition,
  LawOption,
} from "../types/laws";

type LawSeed = {
  id: string;
  category: LawCategory;
  name: string;
  icon: string;
  description: string;
  options: readonly [string, string, string][];
};

const option = (
  lawId: string,
  order: number,
  [id, name, description]: readonly [string, string, string],
): LawOption => ({
  id: `${lawId}:${id}`,
  name,
  description,
  order,
  icon: `stage/${order + 1}`,
  modifiers: [],
  requirements: [],
  incompatibilities: [],
});

const LAW_SEEDS: readonly LawSeed[] = [
  {
    id: "party-system",
    category: "political",
    name: "정당 제도",
    icon: "▥",
    description: "정당의 설립과 정치 참여를 규정합니다.",
    options: [
      ["single-party", "일당제", "하나의 정당만 합법적으로 활동합니다."],
      ["dominant-party", "우세정당제", "복수 정당이 존재하지만 한 정당이 제도를 주도합니다."],
      ["multiparty", "다당제", "복수 정당의 경쟁과 의회 진출을 허용합니다."],
    ],
  },
  {
    id: "religion-policy",
    category: "political",
    name: "종교 정책",
    icon: "⌁",
    description: "국가와 종교기관의 관계를 규정합니다.",
    options: [
      ["state-faith", "국교 우선", "국가가 공인 종교에 제도적 우위를 부여합니다."],
      ["pluralism", "종교 다원주의", "여러 종교의 공적 활동을 허용합니다."],
      ["secularism", "세속주의", "국가 제도와 종교 권위를 분리합니다."],
    ],
  },
  {
    id: "trade-unions",
    category: "political",
    name: "노동조합",
    icon: "✊",
    description: "노동조합의 조직과 교섭 권한을 규정합니다.",
    options: [
      ["banned", "금지", "독립적인 노동조합 활동을 허용하지 않습니다."],
      ["controlled", "허가제", "국가가 승인한 노동조합만 활동합니다."],
      ["allowed", "모두 허용", "노동자의 자율적인 조직과 교섭을 허용합니다."],
    ],
  },
  {
    id: "immigration",
    category: "political",
    name: "이민 정책",
    icon: "▧",
    description: "외국인의 입국과 정착 기준을 규정합니다.",
    options: [
      ["closed", "국경 폐쇄", "특별한 사유가 없는 이민을 제한합니다."],
      ["selective", "선별 이민", "필요 인력과 지정 집단의 이민을 허용합니다."],
      ["open", "개방 이민", "폭넓은 이민과 정착을 허용합니다."],
    ],
  },
  {
    id: "forced-labor",
    category: "political",
    name: "강제노동",
    icon: "⚒",
    description: "국가가 강제노동을 동원할 수 있는 범위를 규정합니다.",
    options: [
      ["extensive", "광범위 동원", "국가 사업에 강제노동을 폭넓게 동원합니다."],
      ["penal-only", "형벌 노동", "형벌 체계 안에서만 노동을 부과합니다."],
      ["prohibited", "금지", "비자발적 노동을 법률로 금지합니다."],
    ],
  },
  {
    id: "assembly",
    category: "political",
    name: "집회·결사의 자유",
    icon: "♧",
    description: "집회와 정치·사회단체 결성의 범위를 규정합니다.",
    options: [
      ["restricted", "엄격 제한", "허가받지 않은 집회와 단체를 제한합니다."],
      ["licensed", "허가제", "행정 허가 아래 집회와 결사를 인정합니다."],
      ["protected", "법적 보장", "평화적 집회와 결사의 자유를 보장합니다."],
    ],
  },
  {
    id: "press",
    category: "political",
    name: "언론의 자유",
    icon: "▤",
    description: "언론기관의 설립과 보도 자유를 규정합니다.",
    options: [
      ["state-media", "국영 언론", "국가가 주요 언론의 편집권을 통제합니다."],
      ["censored", "검열 언론", "민간 언론을 허용하되 사전·사후 검열을 적용합니다."],
      ["free-press", "언론의 자유", "독립 언론과 비판적 보도를 보장합니다."],
    ],
  },
  {
    id: "franchise",
    category: "political",
    name: "선거권",
    icon: "☑",
    description: "대표자를 선출할 수 있는 시민의 범위를 규정합니다.",
    options: [
      ["none", "선거 없음", "국가 지도부를 선거로 구성하지 않습니다."],
      ["restricted", "제한 선거", "재산·신분·성별 등의 조건을 적용합니다."],
      ["universal", "보통 선거", "성인 시민의 평등한 투표권을 인정합니다."],
    ],
  },
  {
    id: "service",
    category: "military",
    name: "군 복무 제도",
    icon: "♜",
    description: "군 복무 인력의 모집 방식을 규정합니다.",
    options: [
      ["volunteer", "지원병제", "자원입대한 인력으로 군을 구성합니다."],
      ["limited", "제한 징병", "필요한 범위에서 징집을 시행합니다."],
      ["mass", "전면 징병", "광범위한 국민에게 군 복무를 부과합니다."],
    ],
  },
  {
    id: "training",
    category: "military",
    name: "군사 훈련",
    icon: "⌃",
    description: "군 교육의 기간과 전문화 수준을 규정합니다.",
    options: [
      ["basic", "기초 훈련", "짧은 기초교육을 중심으로 병력을 양성합니다."],
      ["combat", "전투 교육", "실전 중심의 표준 군사교육을 시행합니다."],
      ["professional", "전문 교육", "장기간의 전문화된 교육과정을 운영합니다."],
    ],
  },
  {
    id: "officers",
    category: "military",
    name: "장교 제도",
    icon: "✥",
    description: "장교단의 선발과 진급 원칙을 규정합니다.",
    options: [
      ["appointed", "신분 임명", "전통적 신분과 인맥을 장교 선발에 반영합니다."],
      ["academy", "사관학교제", "정규 군사교육기관을 통해 장교를 선발합니다."],
      ["merit", "능력 중심", "시험과 복무 성과를 중심으로 진급합니다."],
    ],
  },
  {
    id: "exemptions",
    category: "military",
    name: "병역 면제",
    icon: "⌁",
    description: "병역 의무의 면제 범위를 규정합니다.",
    options: [
      ["broad", "광범위 면제", "다양한 사회·경제적 사유를 인정합니다."],
      ["regulated", "엄격 심사", "법률로 정한 사유만 제한적으로 인정합니다."],
      ["minimal", "최소 면제", "건강상 사유 외의 면제를 거의 인정하지 않습니다."],
    ],
  },
  {
    id: "trade",
    category: "economy",
    name: "무역법",
    icon: "◎",
    description: "관세와 대외 교역의 개방 수준을 규정합니다.",
    options: [
      ["autarky", "자급 우선", "국내 생산과 전략적 자립을 우선합니다."],
      ["tariffs", "전략적 관세", "핵심 산업을 관세로 보호하며 교역합니다."],
      ["open-trade", "개방 무역", "낮은 장벽으로 국제 교역을 확대합니다."],
    ],
  },
  {
    id: "income-tax",
    category: "economy",
    name: "소득세법",
    icon: "%",
    description: "개인소득에 적용되는 과세 구조를 규정합니다.",
    options: [
      ["low", "낮은 소득세", "낮은 세율로 민간 소득을 보전합니다."],
      ["balanced", "균형 과세", "재정과 가계 부담 사이의 균형을 추구합니다."],
      ["progressive", "고소득층 중심", "고소득 구간에 더 높은 세율을 적용합니다."],
    ],
  },
  {
    id: "minimum-wage",
    category: "economy",
    name: "최저임금법",
    icon: "↕",
    description: "법정 최저 노동 보수를 규정합니다.",
    options: [
      ["none", "미설정", "국가 단위 최저임금 기준이 없습니다."],
      ["regional", "지역 기준", "지역별 경제 여건에 맞춰 기준을 둡니다."],
      ["national", "전국 기준", "전국적으로 통일된 최저임금을 보장합니다."],
    ],
  },
  {
    id: "working-hours",
    category: "economy",
    name: "법정 노동시간",
    icon: "08",
    description: "표준 노동시간과 초과근무의 범위를 규정합니다.",
    options: [
      ["long", "장시간 노동", "장시간의 법정 노동을 허용합니다."],
      ["standard", "표준 노동시간", "표준 근무시간과 휴식을 규정합니다."],
      ["short", "단축 노동시간", "근로시간을 줄이고 여가를 확대합니다."],
    ],
  },
  {
    id: "unemployment",
    category: "economy",
    name: "실업급여",
    icon: "$",
    description: "실직자의 소득 지원 범위를 규정합니다.",
    options: [
      ["none", "지원 없음", "국가 차원의 실업 소득보장이 없습니다."],
      ["limited", "제한 지원", "기간과 대상이 제한된 지원을 제공합니다."],
      ["comprehensive", "보편 지원", "폭넓은 실업 소득보장을 제공합니다."],
    ],
  },
  {
    id: "pensions",
    category: "economy",
    name: "연금",
    icon: "♨",
    description: "노령 인구의 소득보장 체계를 규정합니다.",
    options: [
      ["family", "가족 부양", "노후 부양을 가족과 공동체에 맡깁니다."],
      ["occupational", "직역 연금", "직업·조합별 연금제도를 운영합니다."],
      ["public", "공적 연금", "국가가 폭넓은 노후 소득을 보장합니다."],
    ],
  },
  {
    id: "healthcare",
    category: "social",
    name: "의료보험",
    icon: "✚",
    description: "의료서비스의 접근과 비용 부담 방식을 규정합니다.",
    options: [
      ["private", "민간 중심", "의료비를 개인과 민간보험이 주로 부담합니다."],
      ["mixed", "혼합 보장", "공공의료와 민간의료를 함께 운영합니다."],
      ["universal", "보편 의료", "국가가 기본 의료 접근을 보장합니다."],
    ],
  },
  {
    id: "education",
    category: "social",
    name: "교육 정책",
    icon: "▥",
    description: "기초교육의 책임과 접근 범위를 규정합니다.",
    options: [
      ["elite", "선별 교육", "제한된 계층에 집중된 교육체계를 유지합니다."],
      ["primary", "기초교육 지원", "초등교육의 보급을 국가가 지원합니다."],
      ["public", "공교육 보장", "폭넓은 공교육 접근을 보장합니다."],
    ],
  },
  {
    id: "penal-system",
    category: "social",
    name: "형벌 제도",
    icon: "▦",
    description: "범죄에 대한 처벌과 교정 원칙을 규정합니다.",
    options: [
      ["punitive", "엄벌 중심", "강한 형벌과 장기 구금을 중심으로 운용합니다."],
      ["mixed", "처벌과 교정", "처벌과 사회복귀 정책을 병행합니다."],
      ["rehabilitative", "교정 중심", "재활과 사회복귀에 무게를 둡니다."],
    ],
  },
  {
    id: "policing",
    category: "social",
    name: "치안 정책",
    icon: "♙",
    description: "치안기관의 권한과 통제 방식을 규정합니다.",
    options: [
      ["militarized", "군사 치안", "무장 치안조직에 폭넓은 권한을 부여합니다."],
      ["centralized", "중앙 치안", "국가가 통일된 치안체계를 운용합니다."],
      ["civilian", "민간 통제", "민간 행정과 사법 통제 아래 치안을 운용합니다."],
    ],
  },
  {
    id: "industry-regulation",
    category: "social",
    name: "산업 규제",
    icon: "▰",
    description: "산업 안전과 환경·노동 기준을 규정합니다.",
    options: [
      ["minimal", "최소 규제", "기업의 자율과 생산 확대를 우선합니다."],
      ["standard", "표준 규제", "기본적인 안전·노동 기준을 적용합니다."],
      ["strict", "강한 규제", "산업 활동에 엄격한 사회적 기준을 적용합니다."],
    ],
  },
  {
    id: "womens-rights",
    category: "social",
    name: "여성 권리",
    icon: "♀",
    description: "여성의 시민권과 사회 참여 범위를 규정합니다.",
    options: [
      ["restricted", "제한적 권리", "공적·경제적 활동에 법적 제한을 둡니다."],
      ["civil", "시민권 보장", "기본적인 재산권과 시민권을 인정합니다."],
      ["equal", "법적 평등", "성별에 따른 법률상 차별을 금지합니다."],
    ],
  },
  {
    id: "industry-ownership",
    category: "economy",
    name: "산업 소유 구조",
    icon: "⚙",
    description: "산업 자산의 소유와 국가 개입 범위를 규정합니다.",
    options: [
      ["private", "자유 기업", "민간 기업의 소유와 운영을 우선합니다."],
      ["supervised", "국가 감독 자본주의", "국가가 핵심 산업을 감독합니다."],
      ["corporate", "조합주의 경제", "산업별 조합이 생산과 분배를 조정합니다."],
    ],
  },
  {
    id: "land-system",
    category: "economy",
    name: "토지 제도",
    icon: "⌂",
    description: "토지 소유와 농업 생산의 기본 질서를 규정합니다.",
    options: [
      ["estate", "대지주 체제", "대규모 토지 소유와 소작을 유지합니다."],
      ["mixed", "혼합 소유", "대지주·자영농·협동조합을 병존시킵니다."],
      ["smallholder", "소농 자영", "농민의 직접 소유와 경작을 우선합니다."],
    ],
  },
  {
    id: "ethnic-policy",
    category: "social",
    name: "민족 정책",
    icon: "◌",
    description: "국가 안의 민족 공동체와 자치의 범위를 규정합니다.",
    options: [
      ["assimilation", "강제 동화", "단일한 국가 정체성과 언어를 강제합니다."],
      ["coexistence", "차별적 공존", "공동체를 인정하되 권리를 차등 적용합니다."],
      ["autonomy", "제한 자치", "민족 공동체에 제한적인 자치권을 부여합니다."],
    ],
  },
  {
    id: "censorship",
    category: "social",
    name: "검열",
    icon: "▤",
    description: "출판·방송·공공정보에 대한 국가 통제 범위를 규정합니다.",
    options: [
      ["total", "전면 검열", "모든 매체의 제작과 유통을 사전 심사합니다."],
      ["political", "정치 검열", "정권 비판과 국가기밀 보도를 제한합니다."],
      ["wartime", "전시 검열", "전쟁과 비상시에만 통제를 강화합니다."],
    ],
  },
] as const;

const OPTION_EXTENSIONS: Readonly<
  Record<string, readonly [string, string, string][]>
> = {
  "party-system": [
    ["nonpartisan", "비당파 체제", "정당 대신 직능·지역 대표가 정치에 참여합니다."],
    ["military", "군정·임시행정", "비상 행정기구가 정당 활동을 대신합니다."],
  ],
  "religion-policy": [
    ["favored", "우대 종교", "특정 종교를 우대하되 제한적 자유를 허용합니다."],
    ["atheism", "국가 무신론", "공적 제도에서 종교 권위를 배제합니다."],
  ],
  "trade-unions": [
    ["sectoral", "산별 교섭", "산업별 대표조직이 국가와 교섭합니다."],
    ["state-union", "국가 노동조합", "노동조합을 국가 생산체계에 편입합니다."],
  ],
  immigration: [
    ["quota", "할당 이민", "국가별·직종별 할당 안에서 정착을 허용합니다."],
    ["settlement", "정착 장려", "필요 지역의 이주와 정착을 적극 지원합니다."],
  ],
  "forced-labor": [
    ["emergency", "비상 노동", "국가 비상시에만 제한적 동원을 허용합니다."],
    ["contract", "계약 노동", "국가 사업에 법정 계약 노동을 적용합니다."],
  ],
  assembly: [
    ["registered", "등록제", "정해진 절차에 따른 집회와 단체만 인정합니다."],
    ["free", "전면 보장", "평화적 집회와 결사를 폭넓게 보장합니다."],
  ],
  press: [
    ["licensed", "허가 언론", "허가받은 매체만 발행과 방송을 할 수 있습니다."],
    ["plural", "다원 언론", "공적 매체와 독립 매체가 경쟁합니다."],
  ],
  franchise: [
    ["class", "재산·계층 선거", "재산과 신분에 따른 가중 투표를 적용합니다."],
    ["equal", "불평등 보통선거", "보통선거를 허용하되 대표 배분에 차등을 둡니다."],
  ],
  service: [
    ["standard", "표준 징병", "모든 시민에게 일정 기간 복무를 부과합니다."],
    ["total", "총동원", "전시에는 사회 전체를 군사체계에 편입합니다."],
  ],
  training: [
    ["reserve", "예비군 훈련", "현역 복무 뒤 정기적인 재훈련을 시행합니다."],
    ["doctrine", "교리 훈련", "전문 교리와 합동훈련을 중시합니다."],
  ],
  officers: [
    ["political", "정치 장교단", "정치적 신뢰와 충성도를 진급에 반영합니다."],
    ["professional", "전문 직업군", "전문성과 복무 성과를 진급의 기준으로 삼습니다."],
  ],
  exemptions: [
    ["social", "사회적 면제", "필수 산업과 공공업무에 면제를 허용합니다."],
    ["none", "면제 없음", "전시에는 예외 없는 복무를 적용합니다."],
  ],
  trade: [
    ["limited", "제한적 자유무역", "핵심 품목을 보호하며 교역을 확대합니다."],
    ["free", "자유무역", "낮은 장벽과 국제분업을 우선합니다."],
  ],
  "income-tax": [
    ["flat", "단일세율", "소득 구간과 관계없이 동일한 세율을 적용합니다."],
    ["high", "고율 누진세", "고소득 구간에 강한 누진세를 적용합니다."],
  ],
  "minimum-wage": [
    ["sectoral", "산업별 기준", "산업별 교섭으로 최저 기준을 정합니다."],
    ["living", "생활임금", "생활비를 반영한 최저임금을 보장합니다."],
  ],
  "working-hours": [
    ["flexible", "탄력 노동시간", "산업별 필요에 따라 노동시간을 조정합니다."],
    ["six-hour", "6시간 노동", "표준 노동일을 단축하고 휴식을 확대합니다."],
  ],
  unemployment: [
    ["insurance", "고용보험", "노동자와 고용주가 보험료를 분담합니다."],
    ["guaranteed", "국가 고용보장", "국가가 실업자의 소득과 일자리를 보장합니다."],
  ],
  pensions: [
    ["contributory", "기여 연금", "근로 기간과 납입액에 따라 급여를 지급합니다."],
    ["universal", "보편 연금", "모든 노령 시민에게 기본 연금을 지급합니다."],
  ],
  healthcare: [
    ["insurance", "국민건강보험", "보험 방식으로 전국민 의료 접근을 보장합니다."],
    ["state-service", "국가 의료", "의료기관을 국가가 직접 운영합니다."],
  ],
  education: [
    ["secondary", "중등교육 보장", "중등교육까지 국가가 무상으로 제공합니다."],
    ["universal", "전면 공교육", "모든 단계의 교육 접근을 공적으로 보장합니다."],
  ],
  "penal-system": [
    ["capital", "사형 유지", "중대 범죄에 사형을 적용합니다."],
    ["abolished", "사형 폐지", "국가의 형벌에서 사형을 제외합니다."],
  ],
  policing: [
    ["local", "지방 치안", "지역 행정과 주민 조직이 치안을 담당합니다."],
    ["community", "공동체 치안", "주민 참여와 민간 감시를 치안에 결합합니다."],
  ],
  "industry-regulation": [
    ["corporate", "협의 규제", "산업조합과 국가가 기준을 공동으로 정합니다."],
    ["planning", "계획 규제", "국가계획에 맞춰 생산과 안전을 통제합니다."],
  ],
  "womens-rights": [
    ["suffrage", "여성 참정권", "여성의 선거와 공직 참여를 보장합니다."],
    ["equal-access", "완전한 평등", "성별에 따른 모든 법률상 차별을 금지합니다."],
  ],
  "industry-ownership": [
    ["mixed-economy", "혼합경제", "민간과 공공 소유를 산업별로 조합합니다."],
    ["planned", "계획경제", "핵심 생산과 분배를 국가계획으로 운영합니다."],
  ],
  "land-system": [
    ["cooperative", "협동농장", "농민이 공동으로 토지를 경작하고 분배합니다."],
    ["national", "국유 농업", "토지를 국가가 소유하고 생산을 계획합니다."],
  ],
  "ethnic-policy": [
    ["recognition", "다민족 인정", "민족 공동체의 언어와 문화를 법으로 보호합니다."],
    ["federal", "연방적 공존", "민족 단위의 광범위한 자치를 보장합니다."],
  ],
  censorship: [
    ["limited", "제한 검열", "폭력·기밀·명예훼손에 한해 사후 규제합니다."],
    ["free", "언론 자유", "검열 없이 독립 매체와 비판 보도를 보장합니다."],
  ],
};

export const lawDefinitions: readonly LawDefinition[] = LAW_SEEDS.map(
  (seed) => ({
    id: seed.id,
    category: seed.category,
    name: seed.name,
    icon: seed.icon,
    description: seed.description,
    options: [...seed.options, ...(OPTION_EXTENSIONS[seed.id] ?? [])].map((seedOption, index) =>
      option(seed.id, index, seedOption),
    ),
  }),
);

export const lawDefinitionById = new Map(
  lawDefinitions.map((definition) => [definition.id, definition]),
);
