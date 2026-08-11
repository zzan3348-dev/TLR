import type { ApiRequest, ApiResponse } from "../../types.js";
import { currentWorldDate } from "../../diplomacy.js";
import { naviCountryByKey } from "../../naviCountries.js";
import { requireNaviActor, requireNaviAdminClient } from "../../naviAuth.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const admin = requireNaviAdminClient(request, response);
  if (!admin) return;
  const actor = await requireNaviActor(request, response, admin);
  if (!actor) return;
  const country = naviCountryByKey(actor.countryKey);
  if (!country) {
    response.status(409).json({ error: "TLR_COUNTRY_NOT_FOUND" });
    return;
  }
  try {
    const worldDate = await currentWorldDate(admin);
    const settlement = await admin.rpc("tlr_settle_research_points", {
      p_country: actor.countryKey,
      p_world_date: worldDate,
    });
    if (settlement.error) throw settlement.error;
    const [economy, research, decisions] = await Promise.all([
      admin
        .from("country_economies")
        .select("gdp,nominal_growth_rate,inflation_rate,unemployment_rate,research_points,research_income_per_period,research_capacity")
        .eq("country_key", actor.countryKey)
        .maybeSingle(),
      admin
        .from("research_projects")
        .select("id,title,status,scheduled_completion_world_date")
        .eq("country_key", actor.countryKey)
        .in("status", ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "ACTIVE"])
        .order("created_at", { ascending: false }),
      Promise.resolve({ data: [] as unknown[], error: null }),
    ]);
    const failure = [economy, research, decisions].find((result) => result.error);
    if (failure?.error) throw failure.error;
    response.status(200).json({
      profileId: actor.profileId,
      discordUserId: actor.discordUserId,
      country,
      worldDate,
      economy: economy.data ?? null,
      activeResearch: research.data ?? [],
      activeDecisions: decisions.data ?? [],
      decisionsAvailable: false,
    });
  } catch (error) {
    console.error("NAVI country lookup failed", error);
    response.status(503).json({ error: "NAVI_COUNTRY_DATA_UNAVAILABLE" });
  }
}
