import type { ApiRequest, ApiResponse } from "../../types.js";
import { economyWorldDate } from "../../economy.js";
import { requireNaviActor, requireNaviAdminClient } from "../../naviAuth.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const admin = requireNaviAdminClient(response);
  if (!admin) return;
  const actor = await requireNaviActor(request, response, admin);
  if (!actor) return;
  try {
    const worldDate = await economyWorldDate(admin);
    const [economy, readiness, resources] = await Promise.all([
      admin.from("country_economies").select("*").eq("country_key", actor.countryKey).maybeSingle(),
      admin.rpc("tlr_economy_readiness", { p_country: actor.countryKey }),
      admin.from("country_resources").select("*").eq("country_key", actor.countryKey).order("resource_type_id"),
    ]);
    const failure = [economy, readiness, resources].find((result) => result.error);
    if (failure?.error) throw failure.error;
    response.status(200).json({
      countryKey: actor.countryKey,
      worldDate,
      readiness: readiness.data ?? "UNCONFIGURED",
      economy: economy.data ?? null,
      resources: resources.data ?? [],
    });
  } catch (error) {
    console.error("NAVI economy lookup failed", error);
    response.status(503).json({ error: "ECONOMY_DATA_UNAVAILABLE" });
  }
}
