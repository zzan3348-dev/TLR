import { randomUUID } from "node:crypto";
import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { cleanUuid, requireMilitaryActor } from "../../military.js";
import { currentWorldDate } from "../../diplomacy.js";
import { currentNumber, startingCountryStatsForCountry } from "../../startingCountryStats.js";
import { loadCalculatedNationalStats } from "../../countryNationalStats.js";
import { currentTurnNumber } from "../../worldProgression.js";
import { mergeStartingEconomy, startingCapacityForEconomy } from "../../startingEconomies.js";

type RequestBody = { template_id?: unknown; display_name?: unknown; idempotency_key?: unknown; object_kind?: unknown; object_id?: unknown; assigned_front_id?: unknown; action?: unknown; fleet_id?: unknown; vessel_ids?: unknown };


export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "POST" && request.method !== "PATCH") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv(); if (!env) { response.status(503).json({ error: "MILITARY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireMilitaryActor(request, response, admin); if (!actor) return;
  const body = (request.body ?? {}) as RequestBody;
  if (request.method === "POST" && body.action === "CREATE_FLEET") {
    const name = typeof body.display_name === "string" ? body.display_name.trim().slice(0, 80) : "";
    if (!name) { response.status(400).json({ error: "INVALID_FORCE_NAME" }); return; }
    const result = await admin.from("military_fleets").insert({ country_key: actor.countryKey, display_name: name, created_world_date: await currentWorldDate(admin) }).select("*").single();
    response.status(result.error ? 503 : 201).json(result.error ? { error: "FLEET_CREATE_FAILED" } : result.data); return;
  }
  if (request.method === "PATCH" && body.action === "MOVE_VESSELS") {
    const ids = Array.isArray(body.vessel_ids) ? [...new Set(body.vessel_ids.map(cleanUuid))] : [];
    const fleetId = body.fleet_id === null ? null : cleanUuid(body.fleet_id);
    if (!ids.length || ids.length > 200 || ids.some((id) => !id) || (body.fleet_id !== null && !fleetId)) { response.status(400).json({ error: "INVALID_FLEET_MOVE" }); return; }
    if (fleetId) {
      const fleet = await admin.from("military_fleets").select("id").eq("id", fleetId).eq("country_key", actor.countryKey).neq("status", "DISSOLVED").maybeSingle();
      if (fleet.error || !fleet.data) { response.status(403).json({ error: "INVALID_FLEET" }); return; }
    }
    const ships = await admin.from("military_vessels").select("id").in("id", ids).eq("country_key", actor.countryKey).not("status", "in", "(SUNK,RETIRED)");
    if (ships.error || ships.data?.length !== ids.length) { response.status(409).json({ error: "INVALID_VESSEL_SELECTION" }); return; }
    const moved = await admin.from("military_vessels").update({ fleet_id: fleetId }).in("id", ids).eq("country_key", actor.countryKey).not("status", "in", "(SUNK,RETIRED)").select("id");
    response.status(moved.error ? 503 : 200).json(moved.error ? { error: "FLEET_MOVE_FAILED" } : moved.data); return;
  }
  if (request.method === "PATCH") {
    const objectId = cleanUuid(body.object_id);
    const objectKind = typeof body.object_kind === "string" ? body.object_kind : "";
    const tableByKind: Record<string, string> = { LAND_UNIT: "military_land_units", VESSEL: "military_vessels", FLEET: "military_fleets", AIR_WING: "military_air_wings" };
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
          const front = await admin.from("military_fronts").select("id, conflict_id, status, owner_side_id").eq("id", frontId).maybeSingle();
          if (front.error) throw front.error;
          if (!front.data || front.data.status !== "ACTIVE") { response.status(409).json({ error: "FRONT_NOT_ACTIVE" }); return; }
          const participant = await admin.from("military_conflict_participants").select("id").eq("conflict_id", front.data.conflict_id).eq("side_id", front.data.owner_side_id).eq("country_key", actor.countryKey).is("left_world_date", null).maybeSingle();
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
      // Ships retain damage/repair state; assignment must not repair or resurrect them.
      if (objectKind !== "VESSEL") update.status = frontId ? (objectKind === "AIR_WING" ? "ASSIGNED" : "ASSIGNED_TO_FRONT") : "ACTIVE";
    }
    if (Object.keys(update).length === 0) { response.status(400).json({ error: "EMPTY_FORCE_UPDATE" }); return; }
    try {
      const result = await admin.from(table).update(update).eq("id", objectId).eq("country_key", actor.countryKey).in("status", objectKind === "VESSEL" ? ["ACTIVE", "RESERVE", "DAMAGED", "UNDER_REPAIR"] : ["ACTIVE", "RESERVE", "ASSIGNED", "ASSIGNED_TO_FRONT"]).select("*").maybeSingle();
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
    const [template, resources, capacityResult, economy] = await Promise.all([
      admin.from("military_templates").select("*").eq("id", templateId).eq("active", true).or(`country_key.is.null,country_key.eq.${actor.countryKey}`).maybeSingle(),
      admin.from("country_military_resources").select("*").eq("country_key", actor.countryKey).maybeSingle(),
      admin.rpc("tlr_trade_capacity_components", { p_country: actor.countryKey }),
      admin.from("country_economies").select("*").eq("country_key", actor.countryKey).maybeSingle(),
    ]);
    if (template.error || resources.error || capacityResult.error || economy.error) throw template.error ?? resources.error ?? capacityResult.error ?? economy.error;
    if (!template.data || template.data.configuration_status !== "READY") { response.status(409).json({ error: "TEMPLATE_NOT_READY" }); return; }
    const manpowerNeeded = template.data.force_kind === "VESSEL" ? Number(template.data.crew_required) : Number(template.data.manpower_required);
    const capacityNeeded = Number(template.data.production_capacity_required);
    const formationDays = Number(template.data.formation_days);
    const rawManpower = template.data.force_kind === "VESSEL" ? template.data.crew_required : template.data.manpower_required;
    if (rawManpower == null || template.data.production_capacity_required == null || template.data.formation_days == null || ![manpowerNeeded, capacityNeeded, formationDays].every((value) => Number.isFinite(value) && value >= 0)) { response.status(409).json({ error: "TEMPLATE_COSTS_UNCONFIGURED" }); return; }
    const startingStats = startingCountryStatsForCountry(actor.countryKey);
    const worldDate = await currentWorldDate(admin);
    const calculatedStats = await loadCalculatedNationalStats(admin, actor.countryKey, await currentTurnNumber(admin), {}, worldDate);
    const availableManpower = calculatedStats?.availableManpower ?? (startingStats
      ? currentNumber(resources.data?.available_manpower, startingStats.base_available_manpower)
      : resources.data?.available_manpower);
    if (availableManpower === null || availableManpower === undefined) { response.status(409).json({ error: "MANPOWER_UNCONFIGURED" }); return; }
    const capacityData = Array.isArray(capacityResult.data) ? capacityResult.data[0] : capacityResult.data;
    const availableCapacity = capacityData && typeof capacityData === "object" && "available" in capacityData ? Number(capacityData.available) : startingCapacityForEconomy(mergeStartingEconomy(actor.countryKey, economy.data))?.available ?? Number.NaN;
    if (!Number.isFinite(availableCapacity)) { response.status(409).json({ error: "PRODUCTION_CAPACITY_UNCONFIGURED" }); return; }
    const reservedCapacity = Number(resources.data?.reserved_production_capacity ?? 0);
    if (Number(availableManpower) < manpowerNeeded) { response.status(409).json({ error: "INSUFFICIENT_MANPOWER" }); return; }
    if (availableCapacity - reservedCapacity < capacityNeeded) { response.status(409).json({ error: "INSUFFICIENT_PRODUCTION_CAPACITY" }); return; }
    const queue = await admin.rpc("tlr_queue_military_force", {
      p_country: actor.countryKey, p_template: templateId, p_name: displayName,
      p_key: idempotencyKey, p_actor: actor.userId ?? "development",
      p_version: Number(resources.data?.version ?? 0),
      p_available_manpower: availableManpower, p_available_capacity: availableCapacity,
    });
    if (queue.error) throw queue.error;
    response.status(201).json(queue.data);
  } catch (error) { console.error("force request failed", error); response.status(503).json({ error: "FORCE_REQUEST_FAILED" }); }
}
