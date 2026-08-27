import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { requireMilitaryActor } from "../../military.js";

type FrontRow = { id: string };

function counts(rows: Array<{ assigned_front_id: string | null }>, frontId: string): number {
  return rows.filter((row) => row.assigned_front_id === frontId).length;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "MILITARY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireMilitaryActor(request, response, admin); if (!actor) return;
  try {
    const conflicts = await admin.from("military_conflicts").select("id").in("status", ["DECLARED", "ACTIVE", "CEASEFIRE"]);
    if (conflicts.error) throw conflicts.error;
    const conflictIds = (conflicts.data ?? []).map((row) => String(row.id));
    if (conflictIds.length === 0) {
      response.status(200).json({ fronts: [], reports: [], occupations: [], forceSummaries: [] });
      return;
    }
    const [fronts, reports, occupations, landUnits, fleets, airWings, participants] = await Promise.all([
      admin.from("military_fronts").select("*").in("conflict_id", conflictIds).eq("status", "ACTIVE"),
      admin.from("military_war_reports").select("*").in("conflict_id", conflictIds).eq("visibility", "PUBLIC").order("report_world_date", { ascending: false }).limit(100),
      admin.from("military_occupations").select("*").in("conflict_id", conflictIds).eq("status", "ACTIVE_OCCUPATION"),
      admin.from("military_land_units").select("assigned_front_id").in("assigned_conflict_id", conflictIds).neq("status", "DISBANDED"),
      admin.from("military_fleets").select("assigned_front_id").in("assigned_conflict_id", conflictIds).neq("status", "DISSOLVED"),
      admin.from("military_air_wings").select("assigned_front_id").in("assigned_conflict_id", conflictIds).neq("status", "DISBANDED"),
      admin.from("military_conflict_participants").select("conflict_id,side_id,country_key").in("conflict_id", conflictIds).is("left_world_date", null),
    ]);
    const failed = [fronts, reports, occupations, landUnits, fleets, airWings, participants].find((result) => result.error);
    if (failed?.error) throw failed.error;
    const frontRows = (fronts.data ?? []) as FrontRow[];
    response.status(200).json({
      fronts: fronts.data ?? [], reports: (reports.data ?? []).map((report) => {
        const playerSideId = (participants.data ?? []).find((row) => row.conflict_id === report.conflict_id && row.country_key === actor.countryKey)?.side_id;
        const markerTone = playerSideId && report.winner_side_id === playerSideId ? "WIN" : playerSideId && report.loser_side_id === playerSideId ? "LOSS" : report.marker_tone;
        return { ...report, marker_tone: markerTone };
      }), occupations: occupations.data ?? [],
      forceSummaries: frontRows.map((front) => ({
        frontId: front.id,
        landUnits: counts(landUnits.data ?? [], front.id),
        fleets: counts(fleets.data ?? [], front.id),
        airWings: counts(airWings.data ?? [], front.id),
      })),
    });
  } catch (error) {
    console.error("military map state failed", error);
    response.status(503).json({ error: "MILITARY_MAP_STATE_UNAVAILABLE" });
  }
}
