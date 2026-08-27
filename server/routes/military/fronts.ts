import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { cleanUuid, requireMilitaryActor } from "../../military.js";
import { currentWorldDate } from "../../diplomacy.js";

function geometryOf(value: unknown): Array<{ x: number; y: number }> | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 200) return null;
  const points = value.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const { x, y } = raw as { x?: unknown; y?: unknown };
    return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y) ? { x, y } : null;
  });
  return points.some((point) => point === null) ? null : points as Array<{ x: number; y: number }>;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!request.method || !["GET", "POST"].includes(request.method)) { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv(); if (!env) { response.status(503).json({ error: "MILITARY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  if (request.method === "POST") {
    const actor = await requireMilitaryActor(request, response, admin); if (!actor) return;
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const conflictId = cleanUuid(body.conflict_id);
    const opponentSideId = cleanUuid(body.opponent_side_id);
    const displayName = typeof body.display_name === "string" ? body.display_name.trim().slice(0, 160) : "";
    const frontKind = body.front_kind === "NAVAL_AREA" ? "NAVAL_AREA" : "LAND_LINE";
    const geometry = geometryOf(body.geometry);
    if (!conflictId || !opponentSideId || !displayName || !geometry) { response.status(400).json({ error: "INVALID_FRONT" }); return; }
    const participant = await admin.from("military_conflict_participants").select("side_id").eq("conflict_id", conflictId).eq("country_key", actor.countryKey).is("left_world_date", null).maybeSingle();
    if (participant.error) { response.status(503).json({ error: "FRONT_CREATE_FAILED" }); return; }
    if (!participant.data || participant.data.side_id === opponentSideId) { response.status(403).json({ error: "INVALID_FRONT_SIDE" }); return; }
    const opponent = await admin.from("military_conflict_sides").select("id").eq("id", opponentSideId).eq("conflict_id", conflictId).maybeSingle();
    if (opponent.error || !opponent.data) { response.status(400).json({ error: "INVALID_FRONT_SIDE" }); return; }
    const inserted = await admin.from("military_fronts").insert({ conflict_id: conflictId, front_kind: frontKind, display_name: displayName, owner_side_id: participant.data.side_id, opponent_side_id: opponentSideId, geometry, status: "ACTIVE" }).select("*").single();
    if (inserted.error) { response.status(503).json({ error: "FRONT_CREATE_FAILED" }); return; }
    const worldDate = await currentWorldDate(admin);
    await admin.from("military_audit_logs").insert({ actor_subject: actor.userId ?? `development:${actor.countryKey}`, actor_kind: actor.mode, action_kind: "CREATE_FRONT", target_kind: "MILITARY_FRONT", target_id: inserted.data.id, country_key: actor.countryKey, after_state: inserted.data, world_date: worldDate });
    response.status(201).json(inserted.data); return;
  }
  const conflictId = cleanUuid(Array.isArray(request.query?.conflict_id) ? request.query?.conflict_id[0] : request.query?.conflict_id);
  if (!conflictId) { response.status(400).json({ error: "CONFLICT_REQUIRED" }); return; }
  const result = await admin.from("military_fronts").select("*").eq("conflict_id", conflictId).neq("status", "DISSOLVED").order("display_name");
  if (result.error) { response.status(503).json({ error: "FRONTS_UNAVAILABLE" }); return; }
  response.status(200).json(result.data ?? []);
}
