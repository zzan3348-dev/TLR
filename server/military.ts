import type { AdminClient } from "./auth.js";
import type { ApiRequest, ApiResponse } from "./types.js";
import { cleanCountryKey, currentWorldDate, requireDiplomacyActor } from "./diplomacy.js";
import {
  evaluateMilitaryRequirementGroups,
  type MilitaryRequirement,
  type MilitaryRequirementContext,
  type MilitaryRequirementGroup,
  type MilitaryRequirementType,
} from "./militaryRequirementEngine.js";

export const OFFICER_CATEGORIES = ["ACADEMY", "ARMY", "DIVISION_COMMAND"] as const;
export type OfficerCategory = (typeof OFFICER_CATEGORIES)[number];

type CatalogRow = {
  id: string;
  key: string;
  display_name_ko: string;
  description_ko: string;
  icon_path: string | null;
  configuration_status: "PARTIAL" | "READY" | "DISABLED";
  enabled: boolean;
  sort_order: number;
};

type SpiritRow = CatalogRow & { category: OfficerCategory };
type EffectRow = {
  doctrine_id?: string;
  spirit_id?: string;
  effect_key: string;
  value: number;
  unit: "flat" | "percent";
  display_text_ko: string;
  admin_guidance_ko: string;
  sort_order: number;
};
type RequirementGroupRow = {
  id: string;
  target_kind: "GRAND_DOCTRINE" | "OFFICER_SPIRIT";
  target_id: string;
  match_mode: "ALL" | "ANY";
  sort_order: number;
};
type RequirementRow = {
  id: string;
  requirement_group_id: string;
  requirement_type: MilitaryRequirementType;
  target_id: string | null;
  numeric_value: number | null;
  boolean_value: boolean | null;
  metadata: Record<string, unknown> | null;
  description_ko: string;
  sort_order: number;
};
type CorpsRow = {
  country_key: string;
  grand_doctrine_id: string | null;
  academy_spirit_id: string | null;
  army_spirit_id: string | null;
  division_command_spirit_id: string | null;
  version: number;
};

const CATEGORY_COLUMN: Record<OfficerCategory, keyof CorpsRow> = {
  ACADEMY: "academy_spirit_id",
  ARMY: "army_spirit_id",
  DIVISION_COMMAND: "division_command_spirit_id",
};

function requirementLabel(row: RequirementRow): string {
  if (row.description_ko.trim()) return row.description_ko.trim();
  const labels: Record<MilitaryRequirementType, string> = {
    IDEOLOGY_CATEGORY_IS: "지정된 사상 계열이 필요합니다.",
    IDEOLOGY_CATEGORY_IS_NOT: "지정된 사상 계열과 양립할 수 없습니다.",
    IDEOLOGY_CATEGORY_SUPPORT_AT_LEAST: "필요한 사상 지지율에 도달해야 합니다.",
    IDEOLOGY_CATEGORY_SUPPORT_AT_MOST: "사상 지지율이 허용 범위 이하여야 합니다.",
    CIVIL_WAR_SPECTRUM_IS: "지정된 정치 스펙트럼이 필요합니다.",
    CIVIL_WAR_SPECTRUM_IS_NOT: "지정된 정치 스펙트럼과 양립할 수 없습니다.",
    HAS_GRAND_DOCTRINE: "필요한 대교리를 채택해야 합니다.",
    DOES_NOT_HAVE_GRAND_DOCTRINE: "현재 대교리와 양립할 수 없습니다.",
    HAS_OFFICER_SPIRIT: "필요한 장교단 정신을 채택해야 합니다.",
    DOES_NOT_HAVE_OFFICER_SPIRIT: "현재 장교단 정신과 양립할 수 없습니다.",
    HAS_LAW: "필요한 법률이 시행 중이어야 합니다.",
    DOES_NOT_HAVE_LAW: "현재 법률과 양립할 수 없습니다.",
    COUNTRY_STAT_AT_LEAST: "필요한 국가 수치에 도달해야 합니다.",
    COUNTRY_STAT_AT_MOST: "국가 수치가 허용 범위 이하여야 합니다.",
    WORLD_DATE_AFTER: "세계 시간이 지정 날짜에 도달해야 합니다.",
    WORLD_DATE_BEFORE: "지정된 세계 날짜 이전에만 선택할 수 있습니다.",
    CUSTOM_ADMIN_FLAG: "관리자 승인 조건이 필요합니다.",
  };
  return labels[row.requirement_type];
}

function normalizeGroups(
  targetKind: RequirementGroupRow["target_kind"],
  targetId: string,
  groupRows: RequirementGroupRow[],
  requirementRows: RequirementRow[],
): MilitaryRequirementGroup[] {
  return groupRows
    .filter((group) => group.target_kind === targetKind && group.target_id === targetId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((group) => ({
      id: group.id,
      matchMode: group.match_mode,
      requirements: requirementRows
        .filter((row) => row.requirement_group_id === group.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((row): MilitaryRequirement => ({
          id: row.id,
          requirementType: row.requirement_type,
          targetId: row.target_id,
          numericValue: row.numeric_value === null ? null : Number(row.numeric_value),
          booleanValue: row.boolean_value,
          metadata: row.metadata ?? {},
          description: requirementLabel(row),
        })),
    }));
}

async function militaryContext(
  admin: AdminClient,
  countryKey: string,
  worldDate: string,
  corps: CorpsRow | null,
): Promise<MilitaryRequirementContext> {
  const [supportRows, categories, flags] = await Promise.all([
    admin.from("country_ideology_support").select("ideology_category_id,support_percent").eq("country_key", countryKey),
    admin.from("ideology_categories").select("id,civil_war_spectrum_id").eq("enabled", true),
    admin.from("country_military_admin_flags").select("flag_key").eq("country_key", countryKey).eq("enabled", true),
  ]);
  const categoryIds = new Set<string>();
  const categorySupport = new Map<string, number>();
  for (const row of supportRows.data ?? []) {
    if (typeof row.ideology_category_id === "string") categoryIds.add(row.ideology_category_id);
    if (typeof row.ideology_category_id === "string" && row.support_percent !== null) {
      categorySupport.set(row.ideology_category_id, Number(row.support_percent));
    }
  }
  const spectrumIds = new Set<string>();
  for (const row of categories.data ?? []) {
    if (categoryIds.has(String(row.id)) && typeof row.civil_war_spectrum_id === "string") {
      spectrumIds.add(row.civil_war_spectrum_id);
    }
  }
  const selectedSpiritIds = new Set(
    corps
      ? [corps.academy_spirit_id, corps.army_spirit_id, corps.division_command_spirit_id].filter((id): id is string => Boolean(id))
      : [],
  );
  return {
    ideologyCategoryIds: categoryIds,
    ideologyCategorySupport: categorySupport,
    civilWarSpectrumIds: spectrumIds,
    grandDoctrineId: corps?.grand_doctrine_id ?? null,
    officerSpiritIds: selectedSpiritIds,
    lawIds: new Set(),
    countryStats: new Map(),
    worldDate,
    adminFlags: new Set((flags.data ?? []).map((row) => String(row.flag_key))),
  };
}

function effectsFor(id: string, rows: EffectRow[], relation: "doctrine_id" | "spirit_id") {
  return rows
    .filter((row) => row[relation] === id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => ({
      key: row.effect_key,
      value: Number(row.value),
      unit: row.unit,
      displayText: row.display_text_ko,
      ...(row.admin_guidance_ko ? { adminGuidance: row.admin_guidance_ko } : {}),
    }));
}

function publicSelectionState(
  row: CatalogRow,
  selected: boolean,
  requirementsMet: boolean,
): "READY" | "LOCKED" | "PARTIAL" | "DISABLED" | "SELECTED" {
  if (selected) return "SELECTED";
  if (!row.enabled || row.configuration_status === "DISABLED") return "DISABLED";
  if (row.configuration_status !== "READY") return "PARTIAL";
  return requirementsMet ? "READY" : "LOCKED";
}

export async function officerCorpsState(admin: AdminClient, countryKey: string) {
  const worldDate = await currentWorldDate(admin);
  const [doctrines, spirits, doctrineEffects, spiritEffects, groupRows, requirementRows, corpsResult] = await Promise.all([
    admin.from("grand_doctrines").select("id,key,display_name_ko,description_ko,icon_path,configuration_status,enabled,sort_order").order("sort_order").returns<CatalogRow[]>(),
    admin.from("officer_spirits").select("id,key,category,display_name_ko,description_ko,icon_path,configuration_status,enabled,sort_order").order("category").order("sort_order").returns<SpiritRow[]>(),
    admin.from("grand_doctrine_effects").select("doctrine_id,effect_key,value,unit,display_text_ko,admin_guidance_ko,sort_order").returns<EffectRow[]>(),
    admin.from("officer_spirit_effects").select("spirit_id,effect_key,value,unit,display_text_ko,admin_guidance_ko,sort_order").returns<EffectRow[]>(),
    admin.from("military_requirement_groups").select("id,target_kind,target_id,match_mode,sort_order").returns<RequirementGroupRow[]>(),
    admin.from("military_requirements").select("id,requirement_group_id,requirement_type,target_id,numeric_value,boolean_value,metadata,description_ko,sort_order").returns<RequirementRow[]>(),
    admin.from("country_officer_corps").select("country_key,grand_doctrine_id,academy_spirit_id,army_spirit_id,division_command_spirit_id,version").eq("country_key", countryKey).maybeSingle<CorpsRow>(),
  ]);
  const failed = [doctrines, spirits, doctrineEffects, spiritEffects, groupRows, requirementRows, corpsResult].find((result) => result.error);
  if (failed?.error) throw failed.error;
  const corps = corpsResult.data;
  const context = await militaryContext(admin, countryKey, worldDate, corps);
  const publicDoctrines = (doctrines.data ?? []).map((row) => {
    const evaluation = evaluateMilitaryRequirementGroups(
      normalizeGroups("GRAND_DOCTRINE", row.id, groupRows.data ?? [], requirementRows.data ?? []),
      context,
    );
    return {
      id: row.id,
      key: row.key,
      displayName: row.display_name_ko,
      description: row.description_ko,
      iconPath: row.icon_path,
      configurationStatus: row.configuration_status,
      enabled: row.enabled,
      selectionState: publicSelectionState(row, corps?.grand_doctrine_id === row.id, evaluation.met),
      effects: effectsFor(row.id, doctrineEffects.data ?? [], "doctrine_id"),
      requirements: evaluation.groups.flatMap((group) => group.requirements.map((requirement) => ({
        id: requirement.id,
        description: requirement.description,
        met: requirement.met,
      }))),
    };
  });
  const publicSpirits = (spirits.data ?? []).map((row) => {
    const evaluation = evaluateMilitaryRequirementGroups(
      normalizeGroups("OFFICER_SPIRIT", row.id, groupRows.data ?? [], requirementRows.data ?? []),
      context,
    );
    const selected = corps?.[CATEGORY_COLUMN[row.category]] === row.id;
    return {
      id: row.id,
      key: row.key,
      category: row.category,
      displayName: row.display_name_ko,
      description: row.description_ko,
      iconPath: row.icon_path,
      configurationStatus: row.configuration_status,
      enabled: row.enabled,
      selectionState: publicSelectionState(row, selected, evaluation.met),
      effects: effectsFor(row.id, spiritEffects.data ?? [], "spirit_id"),
      requirements: evaluation.groups.flatMap((group) => group.requirements.map((requirement) => ({
        id: requirement.id,
        description: requirement.description,
        met: requirement.met,
      }))),
    };
  });
  return {
    countryKey,
    worldDate,
    version: corps?.version ?? 0,
    doctrine: publicDoctrines.find((row) => row.selectionState === "SELECTED") ?? null,
    selectedSpirits: Object.fromEntries(
      OFFICER_CATEGORIES.flatMap((category) => {
        const selected = publicSpirits.find((row) => row.category === category && row.selectionState === "SELECTED");
        return selected ? [[category, selected]] : [];
      }),
    ),
    doctrines: publicDoctrines,
    spirits: publicSpirits,
  };
}

export async function requireMilitaryActor(request: ApiRequest, response: ApiResponse, admin: AdminClient) {
  return requireDiplomacyActor(request, response, admin);
}

export function countryFromQuery(request: ApiRequest): string | null {
  const raw = request.query?.country_key;
  return cleanCountryKey(Array.isArray(raw) ? raw[0] : raw);
}

export function cleanUuid(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value
    : null;
}
