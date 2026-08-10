import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { requireResearchActor, researchWorldDate } from "../../research.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "RESEARCH_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireResearchActor(request, response, admin);
  if (!actor) return;
  try {
    const worldDate = await researchWorldDate(admin);
    const settled = await admin.rpc("tlr_settle_research_points", { p_country: actor.countryKey, p_world_date: worldDate });
    if (settled.error) throw settled.error;
    const [economy, categories, projects] = await Promise.all([
      admin.from("country_economies").select("research_points,research_income_per_period,research_budget_share,research_capacity").eq("country_key", actor.countryKey).single(),
      admin.from("research_categories").select("id,name,description").eq("active", true).order("sort_order"),
      admin.from("research_projects").select("*").eq("country_key", actor.countryKey).order("created_at", { ascending: false }),
    ]);
    const failed = [economy,categories,projects].find((result) => result.error);
    if (failed?.error) throw failed.error;
    response.status(200).json({
      countryKey: actor.countryKey, worldDate,
      balance: Number(economy.data?.research_points ?? 0),
      incomePerPeriod: Number((Array.isArray(settled.data) ? settled.data[0]?.income_per_period : settled.data?.income_per_period) ?? economy.data?.research_income_per_period ?? 0),
      categories: categories.data ?? [], projects: projects.data ?? [],
    });
  } catch (error) { console.error("research overview failed", error); response.status(503).json({ error: "RESEARCH_DATA_UNAVAILABLE" }); }
}
