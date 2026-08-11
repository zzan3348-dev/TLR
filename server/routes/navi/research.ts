import type { ApiRequest, ApiResponse } from "../../types.js";
import { requireNaviActor, requireNaviAdminClient } from "../../naviAuth.js";
import { cleanPositiveNumber, cleanText, researchWorldDate } from "../../research.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const admin = requireNaviAdminClient(response);
  if (!admin) return;
  const actor = await requireNaviActor(request, response, admin);
  if (!actor) return;
  try {
    const worldDate = await researchWorldDate(admin);
    const settlement = await admin.rpc("tlr_settle_research_points", {
      p_country: actor.countryKey,
      p_world_date: worldDate,
    });
    if (settlement.error) throw settlement.error;
    if (request.method === "GET") {
      const [economy, categories, projects] = await Promise.all([
        admin
          .from("country_economies")
          .select("research_points,research_income_per_period,research_budget_share,research_capacity")
          .eq("country_key", actor.countryKey)
          .single(),
        admin.from("research_categories").select("id,name,description").eq("active", true).order("sort_order"),
        admin.from("research_projects").select("*").eq("country_key", actor.countryKey).order("created_at", { ascending: false }),
      ]);
      const failure = [economy, categories, projects].find((result) => result.error);
      if (failure?.error) throw failure.error;
      response.status(200).json({
        countryKey: actor.countryKey,
        worldDate,
        balance: Number(economy.data?.research_points ?? 0),
        incomePerPeriod: Number(economy.data?.research_income_per_period ?? 0),
        categories: categories.data ?? [],
        projects: projects.data ?? [],
      });
      return;
    }
    if (request.method !== "POST") {
      response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
      return;
    }
    const body = request.body && typeof request.body === "object"
      ? request.body as Record<string, unknown>
      : {};
    const title = cleanText(body.title, 120);
    const categoryId = cleanText(body.categoryId, 40);
    const description = cleanText(body.description, 4000);
    const objective = cleanText(body.objective, 2000);
    const prerequisites = cleanText(body.prerequisites, 1000);
    const initialInvestment = cleanPositiveNumber(body.initialInvestment);
    const idempotencyKey = cleanText(body.idempotencyKey, 120);
    if (!title || !categoryId || !description || !objective || !initialInvestment || !idempotencyKey) {
      response.status(400).json({ error: "INVALID_RESEARCH_REQUEST" });
      return;
    }
    const { data: category, error: categoryError } = await admin
      .from("research_categories")
      .select("id")
      .eq("id", categoryId)
      .eq("active", true)
      .maybeSingle();
    if (categoryError) throw categoryError;
    if (!category) {
      response.status(400).json({ error: "INVALID_RESEARCH_CATEGORY" });
      return;
    }
    const { data: projectId, error } = await admin.rpc("tlr_submit_research_project", {
      p_country: actor.countryKey,
      p_title: title,
      p_category: categoryId,
      p_description: description,
      p_objective: objective,
      p_prerequisites: prerequisites,
      p_initial_investment: initialInvestment,
      p_requested_by: actor.profileId,
      p_world_date: worldDate,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    response.status(201).json({ projectId, countryKey: actor.countryKey, status: "SUBMITTED" });
  } catch (error) {
    console.error("NAVI research request failed", error);
    response.status(503).json({ error: "RESEARCH_DATA_UNAVAILABLE" });
  }
}
