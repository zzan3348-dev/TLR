import { randomUUID } from "node:crypto";
import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { cleanUuid, requireMilitaryActor } from "../../military.js";
import { currentWorldDate } from "../../diplomacy.js";

type RequestBody = { template_id?: unknown; display_name?: unknown; idempotency_key?: unknown; object_kind?: unknown; object_id?: unknown; assigned_front_id?: unknown };

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "POST" && request.method !== "PATCH") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv(); if (!env) { response.status(503).json({ error: "MILITARY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireMilitaryActor(request, response, admin); if (!actor) return;
  const body = (request.body ?? {}) as RequestBody;
  if (request.method === "PATCH") {
    const objectId = cleanUuid(body.object_id);
    const objectKind = typeof body.object_kind === "string" ? body.object_kind : "";
    const tableByKind: Record<string, string> = { LAND_UNIT: "military_land_units", FLEET: "military_fleets", AIR_WING: "military_air_wings" };
    const table = tableByKind[objectKind];
    if (!objectId || !table) { response.status(400).json({ error: "INVALID_FORCE_OBJECT" }); return; }
    const update: Record<string, unknown> = {};
    if (typeof body.display_name === "string") {
      const nextName = body.display_name.trim().slice(0, 80);
      if (!nextName) { response.status(400).json({ error: "INVALID_FORCE_NAME" }); return; }
      update.display_name = nextName;
    }
    if (Object.prototype.hasOwnProperty.call(body, "assigned_front_id")) {
      const frontId = body.assigned_front_id === null ? null : cleanUuid(body.assigned_front_id);
      if (body.assigned_front_id !== null && !frontId) { response.status(400).json({ error: "INVALID_FRONT" }); return; }
      if (frontId) {
        try {
          const front = await admin.from("military_fronts").select("id, conflict_id, status").eq("id", frontId).maybeSingle();
          if (front.error) throw front.error;
          if (!front.data || front.data.status === "DISSOLVED") { response.status(409).json({ error: "FRONT_NOT_ACTIVE" }); return; }
          const participant = await admin.from("military_conflict_participants").select("id").eq("conflict_id", front.data.conflict_id).eq("country_key", actor.countryKey).is("left_world_date", null).maybeSingle();
          if (participant.error) throw participant.error;
          if (!participant.data) { response.status(403).json({ error: "NOT_CONFLICT_PARTICIPANT" }); return; }
          update.assigned_conflict_id = front.data.conflict_id;
        } catch (error) {
          console.error("front assignment validation failed", error);
          response.status(503).json({ error: "FRONT_VALIDATION_FAILED" });
          return;
        }
      } else update.assigned_conflict_id = null;
      update.assigned_front_id = frontId;
      update.status = frontId ? (objectKind === "LAND_UNIT" ? "ASSIGNED_TO_FRONT" : objectKind === "AIR_WING" ? "ASSIGNED" : "ASSIGNED_TO_FRONT") : "ACTIVE";
    }
    if (Object.keys(update).length === 0) { response.status(400).json({ error: "EMPTY_FORCE_UPDATE" }); return; }
    try {
      const result = await admin.from(table).update(update).eq("id", objectId).eq("country_key", actor.countryKey).select("*").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) { response.status(404).json({ error: "FORCE_NOT_FOUND" }); return; }
      response.status(200).json(result.data);
    } catch (error) { console.error("force update failed", error); response.status(503).json({ error: "FORCE_UPDATE_FAILED" }); }
    return;
  }
  const templateId = cleanUuid(body.template_id);
  const displayName = typeof body.display_name === "string" ? body.display_name.trim().slice(0, 80) : "";
  const idempotencyKey = typeof body.idempotency_key === "string" && body.idempotency_key.trim()
    ? body.idempotency_key.trim().slice(0, 120)
    : randomUUID();
  if (!templateId || !displayName) { response.status(400).json({ error: "INVALID_FORCE_REQUEST" }); return; }
  try {
    const duplicate = await admin.from("military_creation_queues").select("*").eq("country_key", actor.countryKey).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (duplicate.error) throw duplicate.error;
    if (duplicate.data) { response.status(200).json(duplicate.data); return; }
    const [template, resources, capacityResult] = await Promise.all([
      admin.from("military_templates").select("*").eq("id", templateId).eq("active", true).maybeSingle(),
      admin.from("country_military_resources").select("*").eq("country_key", actor.countryKey).maybeSingle(),
      admin.rpc("tlr_trade_capacity_components", { p_country: actor.countryKey }),
    ]);
    if (template.error || resources.error) throw template.error ?? resources.error;
    if (!template.data || template.data.configuration_status !== "READY") { response.status(409).json({ error: "TEMPLATE_NOT_READY" }); return; }
    const manpowerNeeded = template.data.force_kind === "VESSEL" ? Number(template.data.crew_required) : Number(template.data.manpower_required);
    const capacityNeeded = Number(template.data.production_capacity_required);
    const formationDays = Number(template.data.formation_days);
    if (![manpowerNeeded, capacityNeeded, formationDays].every(Number.isFinite)) { response.status(409).json({ error: "TEMPLATE_COSTS_UNCONFIGURED" }); return; }
    const availableManpower = resources.data?.available_manpower;
    if (availableManpower === null || availableManpower === undefined) { response.status(409).json({ error: "MANPOWER_UNCONFIGURED" }); return; }
    const capacityData = Array.isArray(capacityResult.data) ? capacityResult.data[0] : capacityResult.data;
    const availableCapacity = capacityData && typeof capacityData === "object" && "available" in capacityData ? Number(capacityData.available) : Number.NaN;
    if (!Number.isFinite(availableCapacity)) { response.status(409).json({ error: "PRODUCTION_CAPACITY_UNCONFIGURED" }); return; }
    const reservedManpower = Number(resources.data?.reserved_manpower ?? 0);
    const reservedCapacity = Number(resources.data?.reserved_production_capacity ?? 0);
    if (Number(availableManpower) - reservedManpower < manpowerNeeded) { response.status(409).json({ error: "INSUFFICIENT_MANPOWER" }); return; }
    if (availableCapacity - reservedCapacity < capacityNeeded) { response.status(409).json({ error: "INSUFFICIENT_PRODUCTION_CAPACITY" }); return; }
    const nextVersion = Number(resources.data?.version ?? 0) + 1;
    const resourceMutation = resources.data
      ? await admin.from("country_military_resources").update({ reserved_manpower: reservedManpower + manpowerNeeded, reserved_production_capacity: reservedCapacity + capacityNeeded, version: nextVersion, updated_at: new Date().toISOString() }).eq("country_key", actor.countryKey).eq("version", resources.data.version).select("version").maybeSingle()
      : await admin.from("country_military_resources").insert({ country_key: actor.countryKey, available_manpower: availableManpower, reserved_manpower: manpowerNeeded, reserved_production_capacity: capacityNeeded, version: 1 }).select("version").maybeSingle();
    if (resourceMutation.error || !resourceMutation.data) { response.status(409).json({ error: "MILITARY_RESOURCE_CONFLICT" }); return; }
    const worldDate = await currentWorldDate(admin);
    const queue = await admin.from("military_creation_queues").insert({
      country_key: actor.countryKey, template_id: templateId, force_kind: template.data.force_kind,
      requested_name: displayName, manpower_reserved: manpowerNeeded, production_capacity_reserved: capacityNeeded,
      requested_world_date: worldDate, completion_world_date: addDays(worldDate, formationDays), idempotency_key: idempotencyKey,
      requested_by: actor.userId ?? "development",
    }).select("*").single();
    if (queue.error) throw queue.error;
    response.status(201).json(queue.data);
  } catch (error) { console.error("force request failed", error); response.status(503).json({ error: "FORCE_REQUEST_FAILED" }); }
}
