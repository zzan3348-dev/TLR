import type { ApiRequest, ApiResponse } from "../../server/types.js";
import { getAdminClient, getServerEnv } from "../../server/auth.js";
import { requireAdminSession } from "../../server/adminAuth.js";
import { currentWorldDate } from "../../server/diplomacy.js";

const CONFIGURATION_STATES = new Set(["PARTIAL", "READY", "DISABLED"]);
const SPIRIT_CATEGORIES = new Set(["ACADEMY", "ARMY", "DIVISION_COMMAND"]);
const TARGET_KINDS = new Set(["GRAND_DOCTRINE", "OFFICER_SPIRIT"]);
const REQUIREMENT_TYPES = new Set([
  "IDEOLOGY_CATEGORY_IS", "IDEOLOGY_CATEGORY_IS_NOT",
  "IDEOLOGY_CATEGORY_SUPPORT_AT_LEAST", "IDEOLOGY_CATEGORY_SUPPORT_AT_MOST",
  "CIVIL_WAR_SPECTRUM_IS", "CIVIL_WAR_SPECTRUM_IS_NOT",
  "HAS_GRAND_DOCTRINE", "DOES_NOT_HAVE_GRAND_DOCTRINE",
  "HAS_OFFICER_SPIRIT", "DOES_NOT_HAVE_OFFICER_SPIRIT",
  "HAS_LAW", "DOES_NOT_HAVE_LAW", "COUNTRY_STAT_AT_LEAST", "COUNTRY_STAT_AT_MOST",
  "WORLD_DATE_AFTER", "WORLD_DATE_BEFORE", "CUSTOM_ADMIN_FLAG",
]);
const OUTCOMES = new Set(["SUCCESS", "PARTIAL", "FAILURE", "INVALID", "WITHDRAWN"]);
const VISIBILITIES = new Set(["PUBLIC", "PARTICIPANTS", "ADMIN_ONLY"]);

function bodyOf(request: ApiRequest): Record<string, unknown> {
  return request.body && typeof request.body === "object" && !Array.isArray(request.body)
    ? request.body as Record<string, unknown>
    : {};
}

function stringValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean && clean.length <= maxLength ? clean : null;
}

function optionalString(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return stringValue(value, maxLength);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function catalogPatch(body: Record<string, unknown>, kind: "GRAND_DOCTRINE" | "OFFICER_SPIRIT") {
  const key = stringValue(body.key, 80);
  const displayName = stringValue(body.displayName, 120);
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 3000) : "";
  const configurationStatus = typeof body.configurationStatus === "string" ? body.configurationStatus : "";
  const category = typeof body.category === "string" ? body.category : null;
  if (!key || !/^[a-z0-9][a-z0-9_-]*$/u.test(key) || !displayName || !CONFIGURATION_STATES.has(configurationStatus)) return null;
  if (kind === "OFFICER_SPIRIT" && (!category || !SPIRIT_CATEGORIES.has(category))) return null;
  return {
    key,
    display_name_ko: displayName,
    description_ko: description,
    icon_path: optionalString(body.iconPath, 500),
    configuration_status: configurationStatus,
    enabled: body.enabled !== false,
    sort_order: typeof body.sortOrder === "number" && Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
    updated_at: new Date().toISOString(),
    ...(kind === "OFFICER_SPIRIT" ? { category } : {}),
  };
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const session = requireAdminSession(request, response);
  if (!session) return;
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "MILITARY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  try {
    const worldDate = await currentWorldDate(admin);
    if (request.method === "GET") {
      const [spectrums, ideologies, doctrines, spirits, doctrineEffects, spiritEffects, groups, requirements, actions] = await Promise.all([
        admin.from("civil_war_spectrums").select("id,key,display_name_ko,description_ko,enabled,sort_order").order("sort_order"),
        admin.from("ideology_categories").select("id,key,display_name_ko,description_ko,color,icon_path,civil_war_spectrum_id,enabled,sort_order").order("sort_order"),
        admin.from("grand_doctrines").select("id,key,display_name_ko,description_ko,icon_path,configuration_status,enabled,sort_order").order("sort_order"),
        admin.from("officer_spirits").select("id,key,category,display_name_ko,description_ko,icon_path,configuration_status,enabled,sort_order").order("category").order("sort_order"),
        admin.from("grand_doctrine_effects").select("*").order("sort_order"),
        admin.from("officer_spirit_effects").select("*").order("sort_order"),
        admin.from("military_requirement_groups").select("*").order("sort_order"),
        admin.from("military_requirements").select("*").order("sort_order"),
        admin.from("military_actions").select("*").in("status", ["SUBMITTED", "UNDER_REVIEW"]).order("created_at"),
      ]);
      const failed = [spectrums, ideologies, doctrines, spirits, doctrineEffects, spiritEffects, groups, requirements, actions].find((result) => result.error);
      if (failed?.error) throw failed.error;
      const actionIds = (actions.data ?? []).map((row) => row.id);
      const assignments = actionIds.length
        ? await admin.from("military_action_assignments").select("*").in("action_id", actionIds)
        : { data: [], error: null };
      if (assignments.error) throw assignments.error;
      response.status(200).json({
        worldDate,
        spectrums: spectrums.data ?? [], ideologies: ideologies.data ?? [],
        doctrines: doctrines.data ?? [], spirits: spirits.data ?? [],
        doctrineEffects: doctrineEffects.data ?? [], spiritEffects: spiritEffects.data ?? [],
        requirementGroups: groups.data ?? [], requirements: requirements.data ?? [],
        actions: (actions.data ?? []).map((action) => ({
          ...action,
          assignments: (assignments.data ?? []).filter((assignment) => assignment.action_id === action.id),
        })),
      });
      return;
    }
    if (request.method !== "POST") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
    const body = bodyOf(request);
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "UPSERT_IDEOLOGY") {
      const key = stringValue(body.key, 80);
      const displayName = stringValue(body.displayName, 120);
      const color = optionalString(body.color, 20);
      const spectrumId = optionalString(body.spectrumId, 64);
      if (!key || !/^[a-z0-9][a-z0-9_-]*$/u.test(key) || !displayName || (color && !/^#[0-9a-f]{6}$/iu.test(color))) {
        response.status(400).json({ error: "INVALID_IDEOLOGY_CATEGORY" }); return;
      }
      const patch = {
        key, display_name_ko: displayName,
        description_ko: typeof body.description === "string" ? body.description.trim().slice(0, 3000) : "",
        color, icon_path: optionalString(body.iconPath, 500), civil_war_spectrum_id: spectrumId,
        enabled: body.enabled !== false,
        sort_order: typeof body.sortOrder === "number" && Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
        updated_at: new Date().toISOString(),
      };
      const id = optionalString(body.id, 64);
      const result = id
        ? await admin.from("ideology_categories").update(patch).eq("id", id).select("id").maybeSingle()
        : await admin.from("ideology_categories").insert(patch).select("id").single();
      if (result.error) throw result.error;
      if (!result.data) { response.status(404).json({ error: "IDEOLOGY_CATEGORY_NOT_FOUND" }); return; }
      response.status(200).json({ ok: true, id: result.data.id }); return;
    }

    if (action === "UPSERT_CATALOG") {
      const targetKind = typeof body.targetKind === "string" ? body.targetKind : "";
      if (!TARGET_KINDS.has(targetKind)) { response.status(400).json({ error: "INVALID_MILITARY_CATALOG" }); return; }
      const kind = targetKind as "GRAND_DOCTRINE" | "OFFICER_SPIRIT";
      const patch = catalogPatch(body, kind);
      if (!patch) { response.status(400).json({ error: "INVALID_MILITARY_CATALOG" }); return; }
      const table = kind === "GRAND_DOCTRINE" ? "grand_doctrines" : "officer_spirits";
      const id = optionalString(body.id, 64);
      const result = id
        ? await admin.from(table).update(patch).eq("id", id).select("id").maybeSingle()
        : await admin.from(table).insert(patch).select("id").single();
      if (result.error) throw result.error;
      if (!result.data) { response.status(404).json({ error: "MILITARY_CATALOG_NOT_FOUND" }); return; }
      await admin.from("military_audit_logs").insert({
        actor_subject: session.sub, actor_kind: session.kind, action_kind: action,
        target_kind: kind, target_id: result.data.id, after_state: patch, world_date: worldDate,
      });
      response.status(200).json({ ok: true, id: result.data.id }); return;
    }

    if (action === "REPLACE_EFFECTS") {
      const targetKind = typeof body.targetKind === "string" ? body.targetKind : "";
      const targetId = stringValue(body.targetId, 64);
      if (!TARGET_KINDS.has(targetKind) || !targetId || !Array.isArray(body.effects)) { response.status(400).json({ error: "INVALID_MILITARY_EFFECTS" }); return; }
      const effects = body.effects.map((raw, index) => {
        const item = objectValue(raw);
        const key = item ? stringValue(item.key, 100) : null;
        const displayText = item ? stringValue(item.displayText, 500) : null;
        const value = item ? finiteNumber(item.value) : null;
        const unit = item?.unit === "percent" ? "percent" : item?.unit === "flat" ? "flat" : null;
        if (!key || !displayText || value === null || !unit) return null;
        return { effect_key: key, display_text_ko: displayText, value, unit, admin_guidance_ko: optionalString(item?.adminGuidance, 1000) ?? "", sort_order: index };
      });
      if (effects.some((effect) => effect === null)) { response.status(400).json({ error: "INVALID_MILITARY_EFFECTS" }); return; }
      const doctrine = targetKind === "GRAND_DOCTRINE";
      const table = doctrine ? "grand_doctrine_effects" : "officer_spirit_effects";
      const relation = doctrine ? "doctrine_id" : "spirit_id";
      const deleted = await admin.from(table).delete().eq(relation, targetId); if (deleted.error) throw deleted.error;
      if (effects.length) {
        const inserted = await admin.from(table).insert(effects.map((effect) => ({ ...effect, [relation]: targetId })));
        if (inserted.error) throw inserted.error;
      }
      response.status(200).json({ ok: true }); return;
    }

    if (action === "REPLACE_REQUIREMENTS") {
      const targetKind = typeof body.targetKind === "string" ? body.targetKind : "";
      const targetId = stringValue(body.targetId, 64);
      if (!TARGET_KINDS.has(targetKind) || !targetId || !Array.isArray(body.groups)) { response.status(400).json({ error: "INVALID_MILITARY_REQUIREMENTS" }); return; }
      const existing = await admin.from("military_requirement_groups").select("id").eq("target_kind", targetKind).eq("target_id", targetId);
      if (existing.error) throw existing.error;
      const ids = (existing.data ?? []).map((row) => row.id);
      if (ids.length) {
        const deleted = await admin.from("military_requirement_groups").delete().in("id", ids); if (deleted.error) throw deleted.error;
      }
      for (const [groupIndex, rawGroup] of body.groups.entries()) {
        const group = objectValue(rawGroup);
        const matchMode = group?.matchMode === "ANY" ? "ANY" : group?.matchMode === "ALL" ? "ALL" : null;
        if (!group || !matchMode || !Array.isArray(group.requirements)) { response.status(400).json({ error: "INVALID_MILITARY_REQUIREMENTS" }); return; }
        const groupInsert = await admin.from("military_requirement_groups").insert({ target_kind: targetKind, target_id: targetId, match_mode: matchMode, sort_order: groupIndex }).select("id").single();
        if (groupInsert.error) throw groupInsert.error;
        const rows = group.requirements.map((raw, index) => {
          const item = objectValue(raw);
          const type = typeof item?.type === "string" ? item.type : "";
          if (!item || !REQUIREMENT_TYPES.has(type)) return null;
          return {
            requirement_group_id: groupInsert.data.id, requirement_type: type,
            target_id: optionalString(item.targetId, 200), numeric_value: item.numericValue === null || item.numericValue === undefined ? null : finiteNumber(item.numericValue),
            boolean_value: typeof item.booleanValue === "boolean" ? item.booleanValue : null,
            description_ko: optionalString(item.description, 500) ?? "", metadata: objectValue(item.metadata) ?? {}, sort_order: index,
          };
        });
        if (rows.some((row) => row === null)) { response.status(400).json({ error: "INVALID_MILITARY_REQUIREMENTS" }); return; }
        const validRows = rows.filter((row): row is NonNullable<typeof row> => row !== null);
        if (validRows.length) { const insertion = await admin.from("military_requirements").insert(validRows); if (insertion.error) throw insertion.error; }
      }
      response.status(200).json({ ok: true }); return;
    }

    if (action === "RESOLVE_ACTION") {
      const actionId = stringValue(body.actionId, 64);
      const outcome = typeof body.outcome === "string" ? body.outcome : "";
      const summary = stringValue(body.summary, 4000);
      const reportTitle = stringValue(body.reportTitle, 160);
      const reportBody = stringValue(body.reportBody, 8000);
      const visibility = typeof body.visibility === "string" ? body.visibility : "PUBLIC";
      if (!actionId || !OUTCOMES.has(outcome) || !summary || !reportTitle || !reportBody || !VISIBILITIES.has(visibility)) { response.status(400).json({ error: "INVALID_MILITARY_RESOLUTION" }); return; }
      const actionRow = await admin.from("military_actions").select("*").eq("id", actionId).in("status", ["SUBMITTED", "UNDER_REVIEW"]).maybeSingle();
      if (actionRow.error) throw actionRow.error;
      if (!actionRow.data) { response.status(409).json({ error: "MILITARY_ACTION_NOT_REVIEWABLE" }); return; }
      const losses = objectValue(body.losses) ?? {};
      const stateChanges = objectValue(body.stateChanges) ?? {};
      const territoryChanges = objectValue(body.territoryChanges) ?? {};
      const resolution = await admin.from("military_action_resolutions").insert({
        action_id: actionId, outcome, summary, losses, state_changes: stateChanges,
        territory_changes: territoryChanges, resolved_world_date: worldDate, admin_user_id: session.sub,
      });
      if (resolution.error) throw resolution.error;
      const updated = await admin.from("military_actions").update({ status: "RESOLVED", version: Number(actionRow.data.version ?? 1) + 1 }).eq("id", actionId).in("status", ["SUBMITTED", "UNDER_REVIEW"]);
      if (updated.error) throw updated.error;
      const report = await admin.from("military_war_reports").insert({
        conflict_id: actionRow.data.conflict_id, action_id: actionId, front_id: actionRow.data.front_id,
        title: reportTitle, body: reportBody, report_world_date: worldDate, losses,
        outcomes: { outcome, stateChanges }, territory_summary: optionalString(body.territorySummary, 2000),
        visibility, marker_tone: outcome === "SUCCESS" ? "WIN" : outcome === "FAILURE" ? "LOSS" : "NEUTRAL",
      });
      if (report.error) throw report.error;
      await Promise.all([
        admin.from("military_notifications").insert({ country_key: actionRow.data.country_key, notification_type: "ACTION_RESOLVED", conflict_id: actionRow.data.conflict_id, title: reportTitle, body: summary, world_date: worldDate }),
        admin.from("military_audit_logs").insert({ actor_subject: session.sub, actor_kind: session.kind, action_kind: "RESOLVE_ACTION", target_kind: "MILITARY_ACTION", target_id: actionId, country_key: actionRow.data.country_key, before_state: actionRow.data, after_state: { outcome, summary, losses, stateChanges, territoryChanges }, world_date: worldDate }),
      ]);
      response.status(200).json({ ok: true }); return;
    }
    response.status(400).json({ error: "INVALID_ADMIN_ACTION" });
  } catch (error) {
    console.error("admin military request failed", error);
    response.status(500).json({ error: "MILITARY_ADMIN_OPERATION_FAILED" });
  }
}
