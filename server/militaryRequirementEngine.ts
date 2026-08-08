export const MILITARY_REQUIREMENT_TYPES = [
  "IDEOLOGY_CATEGORY_IS",
  "IDEOLOGY_CATEGORY_IS_NOT",
  "IDEOLOGY_CATEGORY_SUPPORT_AT_LEAST",
  "IDEOLOGY_CATEGORY_SUPPORT_AT_MOST",
  "CIVIL_WAR_SPECTRUM_IS",
  "CIVIL_WAR_SPECTRUM_IS_NOT",
  "HAS_GRAND_DOCTRINE",
  "DOES_NOT_HAVE_GRAND_DOCTRINE",
  "HAS_OFFICER_SPIRIT",
  "DOES_NOT_HAVE_OFFICER_SPIRIT",
  "HAS_LAW",
  "DOES_NOT_HAVE_LAW",
  "COUNTRY_STAT_AT_LEAST",
  "COUNTRY_STAT_AT_MOST",
  "WORLD_DATE_AFTER",
  "WORLD_DATE_BEFORE",
  "CUSTOM_ADMIN_FLAG",
] as const;

export type MilitaryRequirementType = (typeof MILITARY_REQUIREMENT_TYPES)[number];

export type MilitaryRequirement = {
  id: string;
  requirementType: MilitaryRequirementType;
  targetId: string | null;
  numericValue: number | null;
  booleanValue: boolean | null;
  metadata: Record<string, unknown>;
  description: string;
};

export type MilitaryRequirementGroup = {
  id: string;
  matchMode: "ALL" | "ANY";
  requirements: MilitaryRequirement[];
};

export type MilitaryRequirementContext = {
  ideologyCategoryIds: ReadonlySet<string>;
  ideologyCategorySupport: ReadonlyMap<string, number>;
  civilWarSpectrumIds: ReadonlySet<string>;
  grandDoctrineId: string | null;
  officerSpiritIds: ReadonlySet<string>;
  lawIds: ReadonlySet<string>;
  countryStats: ReadonlyMap<string, number>;
  worldDate: string;
  adminFlags: ReadonlySet<string>;
};

export type EvaluatedRequirement = MilitaryRequirement & { met: boolean };
export type EvaluatedRequirementGroup = Omit<MilitaryRequirementGroup, "requirements"> & {
  met: boolean;
  requirements: EvaluatedRequirement[];
};

function compareDate(left: string, right: string | null, after: boolean): boolean {
  if (!right || !/^\d{4}-\d{2}-\d{2}$/u.test(right)) return false;
  return after ? left >= right : left <= right;
}

export function evaluateMilitaryRequirement(
  requirement: MilitaryRequirement,
  context: MilitaryRequirementContext,
): boolean {
  const target = requirement.targetId;
  const value = requirement.numericValue;
  switch (requirement.requirementType) {
    case "IDEOLOGY_CATEGORY_IS": return Boolean(target && context.ideologyCategoryIds.has(target));
    case "IDEOLOGY_CATEGORY_IS_NOT": return Boolean(target && !context.ideologyCategoryIds.has(target));
    case "IDEOLOGY_CATEGORY_SUPPORT_AT_LEAST":
      return Boolean(target && value !== null && (context.ideologyCategorySupport.get(target) ?? -Infinity) >= value);
    case "IDEOLOGY_CATEGORY_SUPPORT_AT_MOST":
      return Boolean(target && value !== null && (context.ideologyCategorySupport.get(target) ?? Infinity) <= value);
    case "CIVIL_WAR_SPECTRUM_IS": return Boolean(target && context.civilWarSpectrumIds.has(target));
    case "CIVIL_WAR_SPECTRUM_IS_NOT": return Boolean(target && !context.civilWarSpectrumIds.has(target));
    case "HAS_GRAND_DOCTRINE": return Boolean(target && context.grandDoctrineId === target);
    case "DOES_NOT_HAVE_GRAND_DOCTRINE": return Boolean(target && context.grandDoctrineId !== target);
    case "HAS_OFFICER_SPIRIT": return Boolean(target && context.officerSpiritIds.has(target));
    case "DOES_NOT_HAVE_OFFICER_SPIRIT": return Boolean(target && !context.officerSpiritIds.has(target));
    case "HAS_LAW": return Boolean(target && context.lawIds.has(target));
    case "DOES_NOT_HAVE_LAW": return Boolean(target && !context.lawIds.has(target));
    case "COUNTRY_STAT_AT_LEAST":
      return Boolean(target && value !== null && (context.countryStats.get(target) ?? -Infinity) >= value);
    case "COUNTRY_STAT_AT_MOST":
      return Boolean(target && value !== null && (context.countryStats.get(target) ?? Infinity) <= value);
    case "WORLD_DATE_AFTER": return compareDate(context.worldDate, target, true);
    case "WORLD_DATE_BEFORE": return compareDate(context.worldDate, target, false);
    case "CUSTOM_ADMIN_FLAG": {
      const expected = requirement.booleanValue ?? true;
      return Boolean(target) && context.adminFlags.has(target as string) === expected;
    }
  }
}

export function evaluateMilitaryRequirementGroups(
  groups: readonly MilitaryRequirementGroup[],
  context: MilitaryRequirementContext,
): { met: boolean; groups: EvaluatedRequirementGroup[] } {
  const evaluated = groups.map((group) => {
    const requirements = group.requirements.map((requirement) => ({
      ...requirement,
      met: evaluateMilitaryRequirement(requirement, context),
    }));
    const met = requirements.length === 0 || (group.matchMode === "ALL"
      ? requirements.every((requirement) => requirement.met)
      : requirements.some((requirement) => requirement.met));
    return { ...group, requirements, met };
  });
  return { met: evaluated.every((group) => group.met), groups: evaluated };
}
