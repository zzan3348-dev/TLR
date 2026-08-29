import rawLawDefinitions from "../src/features/politics/data/generated/lawDefinitions.json" with { type: "json" };
import rawCountryLawStates from "../src/features/politics/data/generated/countryLawStates.json" with { type: "json" };
import rawNationalSpirits from "../src/data/generated/countryNationalSpirits.json" with { type: "json" };

export type CountryStatModifierKey =
  | "available_manpower"
  | "stability"
  | "war_support"
  | "political_power_gain";

export type CountryStatModifier = {
  key: CountryStatModifierKey;
  value: number;
  unit: "relative_percent" | "percentage_point";
  sourceType: "law" | "national_spirit" | "decision";
  sourceId: string;
  label: string;
};

type LawModifier = { key: string; label: string; value: number; unit: string };
type LawOption = { id: string; name: string; modifiers: readonly LawModifier[] };
type LawDefinition = { id: string; options: readonly LawOption[] };
type CountryLawState = { laws: Record<string, string> };
type SpiritEffect = { text: string };
type NationalSpirit = { id: string; name: string; effects: readonly SpiritEffect[] };
export type DecisionModifierRow = {
  decision_id: string;
  effect_key: string;
  value: number;
  unit: string;
};

const lawDefinitions = rawLawDefinitions as readonly LawDefinition[];
const countryLawStates = rawCountryLawStates as Record<string, CountryLawState>;
const countryNationalSpirits = rawNationalSpirits as Record<string, NationalSpirit[]>;
const lawOptions = new Map(
  lawDefinitions.flatMap((definition) =>
    definition.options.map((option) => [option.id, { definitionId: definition.id, option }] as const),
  ),
);
const spiritsById = new Map(
  Object.values(countryNationalSpirits).flat().map((spirit) => [spirit.id, spirit] as const),
);

const LAW_KEY_MAP: Record<string, CountryStatModifierKey | undefined> = {
  "가용-인력": "available_manpower",
  "안정도": "stability",
  "전쟁-지지도": "war_support",
  "턴당-정치력-변화": "political_power_gain",
};

const SPIRIT_LABEL_MAP: Record<string, CountryStatModifierKey | undefined> = {
  "가용 인력": "available_manpower",
  "가용 인력 변동치": "available_manpower",
  "안정도": "stability",
  "전쟁 지지도": "war_support",
  "정치력 획득": "political_power_gain",
};

function normalizeUnit(value: string): CountryStatModifier["unit"] | null {
  if (value === "percent" || value === "relative_percent") return "relative_percent";
  if (value === "percentagePoint" || value === "percentage_point") return "percentage_point";
  return null;
}

function parseSpiritEffect(text: string): { key: CountryStatModifierKey; value: number; unit: CountryStatModifier["unit"] } | null {
  const match = text.match(/^([^:]+):\s*([+-]?\d+(?:\.\d+)?)%(p)?$/u);
  if (!match) return null;
  const key = SPIRIT_LABEL_MAP[match[1].trim()];
  if (!key) return null;
  return {
    key,
    value: Number(match[2]),
    unit: match[3] ? "percentage_point" : "relative_percent",
  };
}

export function validatedLawChoices(
  countryKey: string,
  requested: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const defaults = countryLawStates[countryKey]?.laws ?? {};
  const result = { ...defaults };
  for (const [definitionId, optionId] of Object.entries(requested)) {
    const catalog = lawOptions.get(optionId);
    if (catalog?.definitionId === definitionId) result[definitionId] = optionId;
  }
  return result;
}

export function readLawChoicesHeader(value: string | string[] | undefined, countryKey: string): Record<string, string> {
  if (typeof value !== "string" || value.length > 12_000) return validatedLawChoices(countryKey);
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return validatedLawChoices(countryKey);
    return validatedLawChoices(countryKey, Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ));
  } catch {
    return validatedLawChoices(countryKey);
  }
}

export function collectCountryStatModifiers(
  countryKey: string,
  lawChoices: Readonly<Record<string, string>> = {},
  activeSpiritIds: readonly string[] = [],
  decisionModifiers: readonly DecisionModifierRow[] = [],
): CountryStatModifier[] {
  const modifiers: CountryStatModifier[] = [];
  for (const optionId of Object.values(validatedLawChoices(countryKey, lawChoices))) {
    const option = lawOptions.get(optionId)?.option;
    if (!option) continue;
    for (const item of option.modifiers) {
      const key = LAW_KEY_MAP[item.key];
      const unit = normalizeUnit(item.unit);
      if (!key || !unit) continue;
      modifiers.push({ key, value: item.value, unit, sourceType: "law", sourceId: option.id, label: option.name });
    }
  }

  const defaultSpirits = countryNationalSpirits[countryKey] ?? [];
  const spirits = new Map(defaultSpirits.map((spirit) => [spirit.id, spirit] as const));
  for (const spiritId of activeSpiritIds) {
    const spirit = spiritsById.get(spiritId);
    if (spirit) spirits.set(spirit.id, spirit);
  }
  for (const spirit of spirits.values()) {
    for (const effect of spirit.effects) {
      const parsed = parseSpiritEffect(effect.text);
      if (!parsed) continue;
      modifiers.push({ ...parsed, sourceType: "national_spirit", sourceId: spirit.id, label: spirit.name });
    }
  }

  for (const item of decisionModifiers) {
    const key = item.effect_key === "available_manpower"
      ? "available_manpower"
      : item.effect_key === "stability"
        ? "stability"
        : item.effect_key === "war_support"
          ? "war_support"
          : item.effect_key === "political_power_gain_modifier"
            ? "political_power_gain"
            : null;
    const unit = normalizeUnit(item.unit);
    if (!key || !unit) continue;
    modifiers.push({ key, value: Number(item.value), unit, sourceType: "decision", sourceId: item.decision_id, label: item.decision_id });
  }
  return modifiers;
}

export type NationalStatCalculationInput = {
  basePoliticalPower: number;
  basePoliticalPowerPerTurn: number;
  storedPoliticalPower?: number | null;
  storedPoliticalPowerGainModifier?: number | null;
  baseStability: number;
  storedStability?: number | null;
  baseWarSupport: number;
  storedWarSupport?: number | null;
  baseAvailableManpower: number;
  activeMilitaryManpower?: number;
  reservedManpower?: number;
  modifiers: readonly CountryStatModifier[];
};

function total(input: readonly CountryStatModifier[], key: CountryStatModifierKey, unit: CountryStatModifier["unit"]): number {
  return input.filter((item) => item.key === key && item.unit === unit).reduce((sum, item) => sum + item.value, 0);
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateNationalStats(input: NationalStatCalculationInput) {
  const manpowerModifierPercent = total(input.modifiers, "available_manpower", "relative_percent");
  const stabilityModifierPoints = total(input.modifiers, "stability", "percentage_point");
  const warSupportModifierPoints = total(input.modifiers, "war_support", "percentage_point");
  const politicalPowerGainModifier =
    Number(input.storedPoliticalPowerGainModifier ?? 0)
    + total(input.modifiers, "political_power_gain", "relative_percent");
  const directStabilityAdjustment = input.storedStability == null ? 0 : input.storedStability - input.baseStability;
  const directWarSupportAdjustment = input.storedWarSupport == null ? 0 : input.storedWarSupport - input.baseWarSupport;
  const mobilizableManpower = Math.max(0, Math.round(input.baseAvailableManpower * (1 + manpowerModifierPercent / 100)));
  const activeMilitaryManpower = Math.max(0, Math.round(input.activeMilitaryManpower ?? 0));
  const reservedManpower = Math.max(0, Math.round(input.reservedManpower ?? 0));
  return {
    basePoliticalPower: input.basePoliticalPower,
    politicalPower: Number(input.storedPoliticalPower ?? input.basePoliticalPower),
    basePoliticalPowerPerTurn: input.basePoliticalPowerPerTurn,
    politicalPowerPerTurn: input.basePoliticalPowerPerTurn * (1 + politicalPowerGainModifier / 100),
    politicalPowerGainModifier,
    baseStability: input.baseStability,
    stability: clamp(input.baseStability + directStabilityAdjustment + stabilityModifierPoints),
    stabilityModifierPoints,
    baseWarSupport: input.baseWarSupport,
    warSupport: clamp(input.baseWarSupport + directWarSupportAdjustment + warSupportModifierPoints),
    warSupportModifierPoints,
    baseAvailableManpower: input.baseAvailableManpower,
    manpowerModifierPercent,
    mobilizableManpower,
    activeMilitaryManpower,
    reservedManpower,
    availableManpower: Math.max(0, mobilizableManpower - activeMilitaryManpower - reservedManpower),
    modifierBreakdown: input.modifiers,
  };
}
