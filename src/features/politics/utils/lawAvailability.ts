import type { PartyIdeologyCategory } from "../../../data/partyIdeologies";
import type { CountryDevelopmentState } from "../types/development";
import type { LawDefinition, LawOption, LawRequirement } from "../types/laws";

export type LawCheckTone = "pass" | "fail" | "pending";

export type LawCheck = {
  id: string;
  label: string;
  current?: string;
  tone: LawCheckTone;
};

export type LawAvailabilityContext = {
  rulingIdeologyCategory: PartyIdeologyCategory;
  rulingPartyName: string;
  rulingPartySupport: number;
  politicalPower: number;
  stability: number;
  warSupport: number;
  gdp: number | null;
  atWar: boolean;
  selectedLawOptions: Readonly<Record<string, string>>;
  developmentState: CountryDevelopmentState;
  activeManualReforms?: number;
  cooldownRemainingByLaw?: Readonly<Record<string, number>>;
  reformingLawIds?: ReadonlySet<string>;
  readOnly?: boolean;
};

export type LawAvailability = {
  requirements: readonly LawCheck[];
  costs: readonly LawCheck[];
  canSelect: boolean;
  state: "available" | "locked" | "approval" | "readonly";
  statusLabel: string;
};

const DEVELOPMENT_ALIASES: Readonly<Record<string, string>> = {
  "학문적 기반": "academic-foundation",
  "보건 수준": "health",
  "행정 발전도": "administration",
  "행정 효율": "administration",
  "산업 전문성": "industry-specialization",
  "산업 전문화 발전도": "industry-specialization",
  "군 전문성": "military-professionalism",
};

function check(tone: LawCheckTone, id: string, label: string, current?: string): LawCheck {
  return { id, label, current, tone };
}

function optionName(
  selectedOptionId: string | undefined,
  definitions: readonly LawDefinition[],
): string {
  if (!selectedOptionId) return "미설정";
  for (const definition of definitions) {
    const option = definition.options.find((candidate) => candidate.id === selectedOptionId);
    if (option) return option.name;
  }
  return selectedOptionId;
}

function evaluateTextRequirement(
  requirement: LawRequirement,
  context: LawAvailabilityContext,
  definitions: readonly LawDefinition[],
): LawCheck {
  const label = requirement.label;
  const supportMatch = label.match(/집권 정당 지지도\s*(\d+)%\s*이상/u);
  if (supportMatch) {
    const required = Number(supportMatch[1]);
    return check(
      context.rulingPartySupport >= required ? "pass" : "fail",
      requirement.key,
      `${context.rulingPartyName} 지지도 ${required}% 이상`,
      `현재 ${context.rulingPartySupport.toFixed(1)}%`,
    );
  }

  const warSupportMatch = label.match(/전쟁 지지도\s*(\d+)%\s*이상/u);
  if (warSupportMatch) {
    const required = Number(warSupportMatch[1]);
    return check(
      context.warSupport >= required ? "pass" : "fail",
      requirement.key,
      `전쟁 지지도 ${required}% 이상`,
      `현재 ${context.warSupport.toFixed(1)}%`,
    );
  }

  const developmentMatch = label.match(/^(.+?)\s*(\d+)\s*이상$/u);
  if (developmentMatch) {
    const developmentId = DEVELOPMENT_ALIASES[developmentMatch[1].trim()];
    if (developmentId) {
      const current = context.developmentState.items.find((item) => item.id === developmentId)?.level ?? null;
      const required = Number(developmentMatch[2]);
      return check(
        current != null && current >= required ? "pass" : "fail",
        requirement.key,
        `${developmentMatch[1].trim()} ${required} 이상`,
        `현재 ${current ?? "미설정"}`,
      );
    }
  }

  if (label === "전쟁 중") {
    return check(context.atWar ? "pass" : "fail", requirement.key, label, context.atWar ? "현재 전쟁 중" : "현재 평시");
  }
  if (label === "전쟁 중 또는 안정도 40% 이하") {
    const satisfied = context.atWar || context.stability <= 40;
    return check(satisfied ? "pass" : "fail", requirement.key, label, `현재 안정도 ${context.stability.toFixed(1)}% · ${context.atWar ? "전쟁 중" : "평시"}`);
  }
  if (label.includes("정당 제도가 '군정·임시행정'이 아닐 것")) {
    const current = optionName(context.selectedLawOptions["party-system"], definitions);
    return check(current !== "군정·임시행정" ? "pass" : "fail", requirement.key, label, `현재 ${current}`);
  }
  if (label.includes("선거권 법률이 '선거 없음'이 아닐 것")) {
    const current = optionName(context.selectedLawOptions.franchise, definitions);
    return check(current !== "선거 없음" ? "pass" : "fail", requirement.key, label, `현재 ${current}`);
  }
  if (label.includes("여성 권리 법률이 '제한적 권리'인 경우 직접 변경 불가")) {
    const current = optionName(context.selectedLawOptions["womens-rights"], definitions);
    return check(current !== "제한적 권리" ? "pass" : "fail", requirement.key, label, `현재 ${current}`);
  }
  if (label.includes("현재 '국가 무신론'이면 직접 변경 불가")) {
    const current = optionName(context.selectedLawOptions["religion-policy"], definitions);
    return check(current !== "국가 무신론" ? "pass" : "fail", requirement.key, label, `현재 ${current}`);
  }
  if (label.includes("현재 '국교 우선'이면 직접 변경 불가")) {
    const current = optionName(context.selectedLawOptions["religion-policy"], definitions);
    return check(current !== "국교 우선" ? "pass" : "fail", requirement.key, label, `현재 ${current}`);
  }

  return check("fail", requirement.key, label, "판정 데이터 미연결");
}

function ideologyCheck(option: LawOption, context: LawAvailabilityContext): LawCheck {
  const ideology = context.rulingIdeologyCategory;
  if (option.incompatibilities.includes(ideology)) {
    return check("fail", "ideology", `${ideology} 집권 시 도입 금지`, `현재 집권 사상: ${ideology}`);
  }
  if (option.conditionalIdeologyCategories?.includes(ideology)) {
    return check("pending", "ideology", `${ideology} 집권 시 관리자 승인 필요`, `현재 집권 사상: ${ideology}`);
  }
  const allowed = option.requirements.find((item) => item.allowedIdeologyCategories)?.allowedIdeologyCategories;
  const satisfied = !allowed || allowed.includes(ideology);
  return check(
    satisfied ? "pass" : "fail",
    "ideology",
    satisfied ? `${ideology} 집권 사상 허용` : `현재 집권 사상은 이 법률을 도입할 수 없음`,
    `현재 집권 사상: ${ideology}`,
  );
}

export function evaluateLawAvailability(
  definition: LawDefinition,
  option: LawOption,
  context: LawAvailabilityContext,
  definitions: readonly LawDefinition[],
): LawAvailability {
  const requirements: LawCheck[] = [ideologyCheck(option, context)];
  const ordinary = option.requirements.filter((item) => !item.allowedIdeologyCategories && item.label !== "또는");
  const evaluated = ordinary.map((item) => evaluateTextRequirement(item, context, definitions));

  if (option.id === "exemptions:none") {
    const alternatives = evaluated.filter((item) => item.label === "전쟁 중" || item.label.startsWith("전쟁 지지도"));
    const satisfied = alternatives.some((item) => item.tone === "pass");
    requirements.push(check(satisfied ? "pass" : "fail", "war-or-support", "전쟁 중 또는 전쟁 지지도 50% 이상", `현재 ${context.atWar ? "전쟁 중" : "평시"} · 전쟁 지지도 ${context.warSupport.toFixed(1)}%`));
    requirements.push(...evaluated.filter((item) => !alternatives.includes(item)));
  } else {
    requirements.push(...evaluated);
  }

  const cooldown = context.cooldownRemainingByLaw?.[definition.id] ?? 0;
  requirements.push(check(cooldown <= 0 ? "pass" : "fail", "cooldown", "재변경 쿨다운 종료", `현재 ${Math.max(0, cooldown)}턴 남음`));
  const reforming = context.reformingLawIds?.has(definition.id) ?? false;
  requirements.push(check(reforming ? "fail" : "pass", "same-law-reform", "같은 법률군의 개정이 진행 중이지 않음"));
  const activeReforms = context.activeManualReforms ?? 0;
  requirements.push(check(activeReforms < 2 ? "pass" : "fail", "reform-slots", "동시 법률 개정 한도 2개", `현재 ${activeReforms}/2`));

  if (option.requiresAdminApproval) {
    requirements.push(check("pending", "admin-approval", "상시 관리자 승인 필요", "승인 대기 전"));
  }

  const politicalPowerCost = option.politicalPowerCost ?? 0;
  const costs: LawCheck[] = [
    check(
      context.politicalPower >= politicalPowerCost ? "pass" : "fail",
      "political-power",
      `정치력 ${politicalPowerCost.toLocaleString("ko-KR")} 필요`,
      `현재 ${context.politicalPower.toLocaleString("ko-KR")}`,
    ),
  ];
  const gdpCost = context.gdp == null ? null : context.gdp * option.implementationCostGdpPct / 100;
  costs.push(check(
    context.gdp == null ? "fail" : "pass",
    "implementation-cost",
    `일회성 시행비: GDP의 ${option.implementationCostGdpPct.toFixed(2)}%`,
    gdpCost == null ? "현재 GDP 미설정" : `현재 GDP 기준 $${gdpCost.toFixed(3)}B`,
  ));

  const checks = [...requirements, ...costs];
  const hasFailure = checks.some((item) => item.tone === "fail");
  const needsApproval = checks.some((item) => item.tone === "pending");
  if (context.readOnly) {
    return { requirements, costs, canSelect: false, state: "readonly", statusLabel: "읽기 전용" };
  }
  if (hasFailure) {
    return { requirements, costs, canSelect: false, state: "locked", statusLabel: "변경 불가" };
  }
  if (needsApproval) {
    return { requirements, costs, canSelect: false, state: "approval", statusLabel: "승인 필요" };
  }
  return { requirements, costs, canSelect: true, state: "available", statusLabel: "개정 시작" };
}

