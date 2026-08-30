import type { Modifier } from "./modifiers";
import type { PartyIdeologyCategory } from "../../../data/partyIdeologies";

export type LawCategory =
  | "political"
  | "military"
  | "economy"
  | "social";

export type LawRequirement = {
  key: string;
  label: string;
  /** 정치 성향 제한은 국가별 문자열이 아닌 공통 대분류로만 판정한다. */
  allowedIdeologyCategories?: readonly PartyIdeologyCategory[];
};

export function meetsLawIdeologyRequirement(
  requirement: LawRequirement,
  ideologyCategory: PartyIdeologyCategory,
): boolean {
  return (
    !requirement.allowedIdeologyCategories ||
    requirement.allowedIdeologyCategories.includes(ideologyCategory)
  );
}

export type LawOption = {
  id: string;
  name: string;
  description: string;
  order: number;
  icon: string;
  modifiers: readonly Modifier[];
  requirements: readonly LawRequirement[];
  incompatibilities: readonly string[];
  conditionalIdeologyCategories?: readonly PartyIdeologyCategory[];
  politicalPowerCost?: number;
  /** 법률이 실제 적용될 때까지 필요한 턴 수. */
  implementationTurns: number;
  /** 개정 시작 시 발생하는 GDP 대비 일회성 추가지출 비율. */
  implementationCostGdpPct: number;
  /** 실제 적용 뒤 같은 법률군을 다시 바꾸기까지 필요한 턴 수. */
  changeCooldownTurns: number;
  requiresAdminApproval?: boolean;
  effectLines?: readonly string[];
  notes?: string | null;
};

export type LawDefinition = {
  id: string;
  category: LawCategory;
  name: string;
  icon: string;
  description: string;
  options: readonly LawOption[];
};

export type CountryLawState = {
  countryId: string;
  laws: Readonly<Record<string, string | "unset">>;
};
