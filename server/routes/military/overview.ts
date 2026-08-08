import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { countryFromQuery } from "../../military.js";
import { currentWorldDate } from "../../diplomacy.js";

type CapacityRow = { available?: unknown };

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const countryKey = countryFromQuery(request);
  if (!countryKey) { response.status(400).json({ error: "COUNTRY_REQUIRED" }); return; }
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "MILITARY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  try {
    const worldDate = await currentWorldDate(admin);
    const [templates, units, vessels, fleets, airWings, queues, resources, capacityResult, participantRows] = await Promise.all([
      admin.from("military_templates").select("*").eq("active", true).order("force_kind").order("display_name"),
      admin.from("military_land_units").select("*").eq("country_key", countryKey).neq("status", "DISBANDED").order("created_world_date"),
      admin.from("military_vessels").select("*").eq("country_key", countryKey).not("status", "in", "(SUNK,RETIRED)").order("laid_down_world_date"),
      admin.from("military_fleets").select("*").eq("country_key", countryKey).neq("status", "DISSOLVED").order("created_world_date"),
      admin.from("military_air_wings").select("*").eq("country_key", countryKey).neq("status", "DISBANDED").order("created_world_date"),
      admin.from("military_creation_queues").select("*").eq("country_key", countryKey).in("status", ["QUEUED", "IN_PROGRESS"]).order("created_at"),
      admin.from("country_military_resources").select("available_manpower,reserved_manpower,reserved_production_capacity").eq("country_key", countryKey).maybeSingle(),
      admin.rpc("tlr_trade_capacity_components", { p_country: countryKey }),
      admin.from("military_conflict_participants").select("conflict_id").eq("country_key", countryKey).is("left_world_date", null),
    ]);
    const requiredResults = [templates, units, vessels, fleets, airWings, queues, resources, participantRows];
    const failed = requiredResults.find((result) => result.error);
    if (failed?.error) throw failed.error;
    const conflictIds = [...new Set((participantRows.data ?? []).map((row) => String(row.conflict_id)))];
    const conflicts = conflictIds.length
      ? await admin.from("military_conflicts").select("*").in("id", conflictIds).not("status", "in", "(ENDED,CANCELLED)").order("started_world_date", { ascending: false })
      : { data: [], error: null };
    if (conflicts.error) throw conflicts.error;

    const capacityData = Array.isArray(capacityResult.data) ? capacityResult.data[0] : capacityResult.data;
    const capacity = capacityData && typeof capacityData === "object" && "available" in capacityData
      ? Number((capacityData as CapacityRow).available)
      : null;
    const manpower = resources.data?.available_manpower === null || resources.data?.available_manpower === undefined
      ? null
      : Number(resources.data.available_manpower);
    const reasons: string[] = [];
    if (manpower === null) reasons.push("가용 인력 수치가 아직 설정되지 않았습니다.");
    if (!Number.isFinite(capacity)) reasons.push("생산 능력 수치가 아직 설정되지 않았습니다.");
    if (!(templates.data ?? []).some((template) => template.configuration_status === "READY")) {
      reasons.push("가동 가능한 군사 편제가 없습니다.");
    }
    response.status(200).json({
      countryKey,
      worldDate,
      readiness: reasons.length === 0 ? "READY" : reasons.length >= 3 ? "UNCONFIGURED" : "PARTIAL",
      reasons,
      manpower: { available: manpower, reserved: Number(resources.data?.reserved_manpower ?? 0) },
      productionCapacity: { available: Number.isFinite(capacity) ? capacity : null, reserved: Number(resources.data?.reserved_production_capacity ?? 0) },
      templates: templates.data ?? [], units: units.data ?? [], vessels: vessels.data ?? [], fleets: fleets.data ?? [],
      airWings: airWings.data ?? [], queues: queues.data ?? [], conflicts: conflicts.data ?? [],
    });
  } catch (error) {
    console.error("military overview failed", error);
    response.status(503).json({ error: "MILITARY_DATA_UNAVAILABLE" });
  }
}
