import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv(); if (!env) { response.status(503).json({ error: "MILITARY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  try {
    const conflicts = await admin.from("military_conflicts").select("*").neq("status", "DRAFT").order("started_world_date", { ascending: false });
    if (conflicts.error) throw conflicts.error;
    const ids = (conflicts.data ?? []).map((row) => row.id);
    const [sides, participants] = ids.length ? await Promise.all([
      admin.from("military_conflict_sides").select("*").in("conflict_id", ids).order("sort_order"),
      admin.from("military_conflict_participants").select("*").in("conflict_id", ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (sides.error || participants.error) throw sides.error ?? participants.error;
    response.status(200).json((conflicts.data ?? []).map((conflict) => ({
      ...conflict,
      sides: (sides.data ?? []).filter((side) => side.conflict_id === conflict.id).map((side) => ({
        ...side,
        participants: (participants.data ?? []).filter((participant) => participant.side_id === side.id),
      })),
    })));
  } catch (error) { console.error("conflict read failed", error); response.status(503).json({ error: "CONFLICTS_UNAVAILABLE" }); }
}
