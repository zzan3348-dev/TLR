import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { cleanUuid, requireMilitaryActor } from "../../military.js";
import { currentWorldDate } from "../../diplomacy.js";

const KINDS = new Set(["LAND_UNIT", "VESSEL", "FLEET", "AIR_WING"]);
type Assignment = { object_kind?: unknown; object_id?: unknown };
type Body = { id?: unknown; conflict_id?: unknown; front_id?: unknown; title?: unknown; body?: unknown; status?: unknown; assignments?: unknown; expected_version?: unknown };

function assignments(value: unknown): Array<{ object_kind: string; object_id: string }> | null {
  if (!Array.isArray(value)) return [];
  const result: Array<{ object_kind: string; object_id: string }> = [];
  for (const raw of value as Assignment[]) {
    const id = cleanUuid(raw.object_id);
    if (typeof raw.object_kind !== "string" || !KINDS.has(raw.object_kind) || !id) return null;
    result.push({ object_kind: raw.object_kind, object_id: id });
  }
  return result;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!request.method || !["GET", "POST", "PATCH"].includes(request.method)) { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv(); if (!env) { response.status(503).json({ error: "MILITARY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireMilitaryActor(request, response, admin); if (!actor) return;
  if (request.method === "GET") {
    const conflictId = cleanUuid(Array.isArray(request.query?.conflict_id) ? request.query?.conflict_id[0] : request.query?.conflict_id);
    let query = admin.from("military_actions").select("*").eq("country_key", actor.countryKey).order("created_at", { ascending: false });
    if (conflictId) query = query.eq("conflict_id", conflictId);
    const rows = await query;
    if (rows.error) { response.status(503).json({ error: "ACTIONS_UNAVAILABLE" }); return; }
    const ids = (rows.data ?? []).map((row) => row.id);
    const [assigned, resolutions] = ids.length ? await Promise.all([
      admin.from("military_action_assignments").select("*").in("action_id", ids),
      admin.from("military_action_resolutions").select("*").in("action_id", ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (assigned.error || resolutions.error) { response.status(503).json({ error: "ACTIONS_UNAVAILABLE" }); return; }
    response.status(200).json((rows.data ?? []).map((row) => ({ ...row, assignments: (assigned.data ?? []).filter((entry) => entry.action_id === row.id), resolution: (resolutions.data ?? []).find((entry) => entry.action_id === row.id) ?? null })));
    return;
  }
  const body = (request.body ?? {}) as Body;
  if (request.method === "PATCH" && body.status === "WITHDRAWN") {
    const id = cleanUuid(body.id);
    const expectedVersion = Number(body.expected_version);
    if (!id || !Number.isInteger(expectedVersion)) { response.status(400).json({ error: "ACTION_VERSION_REQUIRED" }); return; }
    const withdrawn = await admin.from("military_actions").update({ status: "WITHDRAWN", version: expectedVersion + 1 }).eq("id", id).eq("country_key", actor.countryKey).in("status", ["SUBMITTED", "UNDER_REVIEW"]).eq("version", expectedVersion).select("*").maybeSingle();
    if (withdrawn.error) { response.status(503).json({ error: "ACTION_WITHDRAW_FAILED" }); return; }
    if (!withdrawn.data) { response.status(409).json({ error: "ACTION_LOCKED" }); return; }
    response.status(200).json(withdrawn.data); return;
  }
  const conflictId = cleanUuid(body.conflict_id);
  const frontId = body.front_id === null || body.front_id === "" ? null : cleanUuid(body.front_id);
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 8000) : "";
  const status = body.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT";
  const selected = assignments(body.assignments);
  if (!conflictId || !title || !text || selected === null) { response.status(400).json({ error: "INVALID_ACTION" }); return; }
  try {
    const participant = await admin.from("military_conflict_participants").select("id").eq("conflict_id", conflictId).eq("country_key", actor.countryKey).is("left_world_date", null).maybeSingle();
    if (participant.error) throw participant.error;
    if (!participant.data) { response.status(403).json({ error: "NOT_CONFLICT_PARTICIPANT" }); return; }
    if (frontId) {
      const front = await admin.from("military_fronts").select("id").eq("id", frontId).eq("conflict_id", conflictId).neq("status", "DISSOLVED").maybeSingle();
      if (front.error) throw front.error;
      if (!front.data) { response.status(400).json({ error: "INVALID_FRONT" }); return; }
    }
    if (selected.length) {
      const tableByKind: Record<string, string> = {
        LAND_UNIT: "military_land_units", VESSEL: "military_vessels",
        FLEET: "military_fleets", AIR_WING: "military_air_wings",
      };
      for (const entry of selected) {
        const owned = await admin.from(tableByKind[entry.object_kind]).select("id").eq("id", entry.object_id).eq("country_key", actor.countryKey).maybeSingle();
        if (owned.error) throw owned.error;
        if (!owned.data) { response.status(400).json({ error: "INVALID_FORCE_ASSIGNMENT" }); return; }
      }
      if (status === "SUBMITTED") {
        const ids = selected.map((entry) => entry.object_id);
        const existingAssignments = await admin.from("military_action_assignments").select("action_id,object_kind,object_id").in("object_id", ids);
        if (existingAssignments.error) throw existingAssignments.error;
        const actionIds = [...new Set((existingAssignments.data ?? []).map((row) => String(row.action_id)))];
        if (actionIds.length) {
          const activeActions = await admin.from("military_actions").select("id").in("id", actionIds).in("status", ["SUBMITTED", "UNDER_REVIEW"]);
          if (activeActions.error) throw activeActions.error;
          const currentId = cleanUuid(body.id);
          if ((activeActions.data ?? []).some((row) => row.id !== currentId)) { response.status(409).json({ error: "FORCE_ALREADY_IN_OPERATION" }); return; }
        }
      }
    }
    const submittedWorldDate = status === "SUBMITTED" ? await currentWorldDate(admin) : null;
    let actionId: string;
    if (request.method === "PATCH") {
      const id = cleanUuid(body.id);
      const expectedVersion = Number(body.expected_version);
      if (!id || !Number.isInteger(expectedVersion) || expectedVersion < 1) { response.status(400).json({ error: "ACTION_VERSION_REQUIRED" }); return; }
      const update = await admin.from("military_actions").update({ conflict_id: conflictId, front_id: frontId, title, body: text, status, submitted_world_date: submittedWorldDate, version: expectedVersion + 1 }).eq("id", id).eq("country_key", actor.countryKey).eq("status", "DRAFT").eq("version", expectedVersion).select("id").maybeSingle();
      if (update.error) throw update.error;
      if (!update.data) { response.status(409).json({ error: "ACTION_LOCKED" }); return; }
      actionId = id;
      await admin.from("military_action_assignments").delete().eq("action_id", id);
    } else {
      const inserted = await admin.from("military_actions").insert({ conflict_id: conflictId, country_key: actor.countryKey, front_id: frontId, title, body: text, status, submitted_world_date: submittedWorldDate }).select("id").single();
      if (inserted.error) throw inserted.error;
      actionId = inserted.data.id;
    }
    if (selected.length) {
      const insertion = await admin.from("military_action_assignments").insert(selected.map((entry) => ({ action_id: actionId, ...entry })));
      if (insertion.error) throw insertion.error;
    }
    const result = await admin.from("military_actions").select("*").eq("id", actionId).single();
    if (result.error) throw result.error;
    response.status(request.method === "POST" ? 201 : 200).json({ ...result.data, assignments: selected });
  } catch (error) { console.error("military action failed", error); response.status(503).json({ error: "ACTION_SAVE_FAILED" }); }
}
