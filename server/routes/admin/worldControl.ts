import { mapCountries } from "../../../src/data/mapCountries.js";
import { requireAdminSession } from "../../adminAuth.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import type { ApiRequest, ApiResponse } from "../../types.js";
import { safeDetail, validSituationLevel } from "../../worldControl.js";
import { planWorldProgression, type TurnDefinition } from "../../worldProgression.js";

async function readAdminData(admin: ReturnType<typeof getAdminClient>) {
  const [world, requests] = await Promise.all([
    admin.from("world_state").select("current_world_date,world_situation_level,world_situation_reason,world_situation_changed_world_date").eq("singleton", true).single(),
    admin.from("world_time_requests").select("country_key,request_state,hold_reason,details,requested_world_date,updated_at").order("updated_at", { ascending: false }),
  ]);
  if (world.error || requests.error || !world.data) throw world.error ?? requests.error ?? new Error("WORLD_STATE_UNAVAILABLE");
  const turnState = await admin.from("world_state").select("current_turn_id").eq("singleton", true).single<{ current_turn_id: string | null }>();
  const turnDefinition = !turnState.error && turnState.data?.current_turn_id
    ? await admin.from("turn_definitions").select("id,turn_number,start_world_date,end_world_date,status").eq("id", turnState.data.current_turn_id).maybeSingle<{ id: string; turn_number: number; start_world_date: string; end_world_date: string | null; status: "PLANNED" | "ACTIVE" | "SETTLED" }>()
    : null;
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
    turn: turnDefinition?.data ? {
      configured: true,
      id: turnDefinition.data.id,
      number: turnDefinition.data.turn_number,
      startWorldDate: turnDefinition.data.start_world_date,
      endWorldDate: turnDefinition.data.end_world_date,
      status: turnDefinition.data.status,
    } : { configured: false, id: null, number: null, startWorldDate: null, endWorldDate: null, status: null },
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
    if (action === "PREVIEW_WORLD_TIME" || action === "ADVANCE_WORLD_TIME") {
      const targetWorldDate = safeDetail(body.targetWorldDate, 10);
      if (!reason || !targetWorldDate || !/^\d{4}-\d{2}-\d{2}$/u.test(targetWorldDate)) return void response.status(400).json({ error: "INVALID_WORLD_TIME_ADVANCE" });
      const before = await readAdminData(admin);
      const turns = await admin.from("turn_definitions").select("id,turn_number,start_world_date,end_world_date,status").order("turn_number").returns<Array<{ id: string; turn_number: number; start_world_date: string; end_world_date: string | null; status: TurnDefinition["status"] }>>();
      const schedule: TurnDefinition[] = turns.error ? [] : (turns.data ?? []).map((turn) => ({ id: turn.id, turnNumber: turn.turn_number, startWorldDate: turn.start_world_date, endWorldDate: turn.end_world_date, status: turn.status }));
      const planned = planWorldProgression(before.worldDate, targetWorldDate, before.turn.id, schedule);
      if (action === "PREVIEW_WORLD_TIME") return void response.status(200).json({
        preview: true,
        currentWorldDate: before.worldDate,
        targetWorldDate,
        currentTurnNumber: before.turn.number,
        resultingTurnNumber: planned.crossedTurnBoundaries.length ? planned.crossedTurnBoundaries.at(-1)!.turnNumber + 1 : before.turn.number,
        crossedTurnBoundaries: planned.crossedTurnBoundaries.map((turn) => ({ id: turn.id, turnNumber: turn.turnNumber, endWorldDate: turn.endWorldDate })),
        dateBasedProcesses: ["외교 만료", "연구 완료", "첩보 단계", "무역 정산"],
        turnBasedProcesses: planned.crossedTurnBoundaries.length ? ["턴 정치력 지급", "턴 종료 정산", "다음 턴 시작"] : [],
      });
      const idempotencyKey = safeDetail(body.idempotencyKey, 120);
      if (!idempotencyKey) return void response.status(400).json({ error: "WORLD_TIME_IDEMPOTENCY_REQUIRED" });
      const result = await admin.rpc("tlr_advance_world_time", { p_target_date: targetWorldDate, p_actor: session.sub, p_reason: reason, p_idempotency_key: idempotencyKey });
      if (result.error || !(result.data as { ok?: boolean } | null)?.ok) return void response.status(409).json({ error: result.error?.message ?? (result.data as { error?: string } | null)?.error ?? "WORLD_TIME_ADVANCE_FAILED" });
      return void response.status(200).json(await readAdminData(admin));
    }
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
