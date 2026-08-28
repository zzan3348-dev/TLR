import { getAdminClient, getServerEnv } from "../../auth.js";
import { requireDiplomacyActor } from "../../diplomacy.js";
import type { ApiRequest, ApiResponse } from "../../types.js";
import { WORLD_TIME_HOLD_REASONS, safeDetail } from "../../worldControl.js";

type RequestRow = {
  request_state: "ADVANCE" | "HOLD";
  hold_reason: (typeof WORLD_TIME_HOLD_REASONS)[number] | null;
  details: string | null;
  requested_world_date: string;
  updated_at: string;
};

async function overview(admin: ReturnType<typeof getAdminClient>, countryKey: string) {
  const [world, request, research, intelligence] = await Promise.all([
    admin.from("world_state").select("current_world_date,world_situation_level,world_situation_reason,world_situation_changed_world_date").eq("singleton", true).single(),
    admin.from("world_time_requests").select("request_state,hold_reason,details,requested_world_date,updated_at").eq("country_key", countryKey).maybeSingle<RequestRow>(),
    admin.from("research_projects").select("id,title,scheduled_completion_world_date").eq("country_key", countryKey).eq("status", "ACTIVE").not("scheduled_completion_world_date", "is", null).order("scheduled_completion_world_date").limit(12),
    admin.from("spy_operations").select("id,definition_key,current_phase,phase_end_world_date").eq("observer_country_id", countryKey).eq("state", "ACTIVE").not("phase_end_world_date", "is", null).order("phase_end_world_date").limit(12),
  ]);
  const failed = [world, request, research, intelligence].find((result) => result.error);
  if (failed?.error || !world.data) throw failed?.error ?? new Error("WORLD_STATE_UNAVAILABLE");
  const state = world.data as {
    current_world_date: string;
    world_situation_level: number;
    world_situation_reason: string | null;
    world_situation_changed_world_date: string | null;
  };
  return {
    worldDate: state.current_world_date,
    situationLevel: state.world_situation_level,
    situationReason: state.world_situation_reason,
    situationChangedWorldDate: state.world_situation_changed_world_date,
    request: request.data ? {
      state: request.data.request_state,
      holdReason: request.data.hold_reason,
      details: request.data.details,
      requestedWorldDate: request.data.requested_world_date,
      updatedAt: request.data.updated_at,
    } : { state: "NONE", holdReason: null, details: null, requestedWorldDate: null, updatedAt: null },
    schedules: [
      ...(research.data ?? []).map((row) => ({ id: `research:${row.id}`, kind: "RESEARCH", title: row.title, dueWorldDate: row.scheduled_completion_world_date })),
      ...(intelligence.data ?? []).map((row) => ({ id: `intelligence:${row.id}`, kind: "INTELLIGENCE", title: `${row.definition_key} · ${row.current_phase}`, dueWorldDate: row.phase_end_world_date })),
    ].sort((a, b) => String(a.dueWorldDate).localeCompare(String(b.dueWorldDate))),
  };
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "WORLD_CONTROL_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireDiplomacyActor(request, response, admin);
  if (!actor) return;
  try {
    if (request.method === "GET") {
      response.status(200).json(await overview(admin, actor.countryKey));
      return;
    }
    if (request.method !== "POST") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "CANCEL") {
      const result = await admin.from("world_time_requests").delete().eq("country_key", actor.countryKey);
      if (result.error) throw result.error;
    } else if (action === "ADVANCE" || action === "HOLD") {
      const holdReason = typeof body.holdReason === "string" && WORLD_TIME_HOLD_REASONS.includes(body.holdReason as never) ? body.holdReason : null;
      if (action === "HOLD" && !holdReason) { response.status(400).json({ error: "HOLD_REASON_REQUIRED" }); return; }
      const world = await admin.from("world_state").select("current_world_date").eq("singleton", true).single<{ current_world_date: string }>();
      if (world.error || !world.data) throw world.error ?? new Error("WORLD_STATE_UNAVAILABLE");
      const result = await admin.from("world_time_requests").upsert({
        country_key: actor.countryKey,
        request_state: action,
        hold_reason: action === "HOLD" ? holdReason : null,
        details: action === "HOLD" ? safeDetail(body.details) : null,
        requested_by_user_id: actor.userId,
        requested_world_date: world.data.current_world_date,
        updated_at: new Date().toISOString(),
      }, { onConflict: "country_key" });
      if (result.error) throw result.error;
    } else {
      response.status(400).json({ error: "INVALID_WORLD_TIME_REQUEST" });
      return;
    }
    response.status(200).json(await overview(admin, actor.countryKey));
  } catch (error) {
    console.error("world control request failed", error);
    response.status(503).json({ error: "WORLD_CONTROL_UNAVAILABLE" });
  }
}
