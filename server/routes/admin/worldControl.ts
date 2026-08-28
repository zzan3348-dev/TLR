import { mapCountries } from "../../../src/data/mapCountries.js";
import { requireAdminSession } from "../../adminAuth.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import type { ApiRequest, ApiResponse } from "../../types.js";
import { safeDetail, validSituationLevel } from "../../worldControl.js";

async function readAdminData(admin: ReturnType<typeof getAdminClient>) {
  const [world, requests] = await Promise.all([
    admin.from("world_state").select("current_world_date,world_situation_level,world_situation_reason,world_situation_changed_world_date").eq("singleton", true).single(),
    admin.from("world_time_requests").select("country_key,request_state,hold_reason,details,requested_world_date,updated_at").order("updated_at", { ascending: false }),
  ]);
  if (world.error || requests.error || !world.data) throw world.error ?? requests.error ?? new Error("WORLD_STATE_UNAVAILABLE");
  const rows = requests.data ?? [];
  const requested = new Set(rows.map((row) => row.country_key));
  return {
    worldDate: world.data.current_world_date,
    situationLevel: world.data.world_situation_level,
    situationReason: world.data.world_situation_reason,
    situationChangedWorldDate: world.data.world_situation_changed_world_date,
    counts: {
      advance: rows.filter((row) => row.request_state === "ADVANCE").length,
      hold: rows.filter((row) => row.request_state === "HOLD").length,
      none: Math.max(0, mapCountries.length - requested.size),
    },
    requests: rows.map((row) => ({ countryKey: row.country_key, state: row.request_state, holdReason: row.hold_reason, details: row.details, requestedWorldDate: row.requested_world_date, updatedAt: row.updated_at })),
    noRequestCountryKeys: mapCountries.map((country) => country.key).filter((key) => !requested.has(key)),
  };
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const session = requireAdminSession(request, response);
  if (!session) return;
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "WORLD_CONTROL_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  try {
    if (request.method === "GET") { response.status(200).json(await readAdminData(admin)); return; }
    if (request.method !== "POST") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const action = typeof body.action === "string" ? body.action : "";
    const reason = safeDetail(body.reason, 1000);
    const level = body.level;
    if ((action !== "PREVIEW_SITUATION" && action !== "SET_SITUATION") || !validSituationLevel(level) || !reason) {
      response.status(400).json({ error: "INVALID_SITUATION_CHANGE" });
      return;
    }
    const before = await readAdminData(admin);
    if (action === "PREVIEW_SITUATION") {
      response.status(200).json({ preview: true, before: before.situationLevel, after: level, reason });
      return;
    }
    const update = await admin.from("world_state").update({
      world_situation_level: level,
      world_situation_reason: reason,
      world_situation_changed_world_date: before.worldDate,
    }).eq("singleton", true);
    if (update.error) throw update.error;
    const audit = await admin.from("world_control_audit_logs").insert({
      actor: session.sub,
      actor_kind: session.kind,
      action: "SET_SITUATION",
      world_date: before.worldDate,
      before_state: { level: before.situationLevel, reason: before.situationReason },
      after_state: { level, reason },
      reason,
    });
    if (audit.error) throw audit.error;
    response.status(200).json(await readAdminData(admin));
  } catch (error) {
    console.error("admin world control failed", error);
    response.status(503).json({ error: "WORLD_CONTROL_ADMIN_UNAVAILABLE" });
  }
}
