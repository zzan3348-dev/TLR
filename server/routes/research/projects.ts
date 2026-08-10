import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { cleanPositiveNumber, cleanText, requireResearchActor, researchWorldDate } from "../../research.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "POST") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "RESEARCH_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireResearchActor(request, response, admin);
  if (!actor) return;
  const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
  const title = cleanText(body.title, 120), categoryId = cleanText(body.categoryId, 40);
  const description = cleanText(body.description, 4000), objective = cleanText(body.objective, 2000);
  const prerequisites = cleanText(body.prerequisites, 1000), initialInvestment = cleanPositiveNumber(body.initialInvestment);
  if (!title || !categoryId || !description || !objective || !initialInvestment) { response.status(400).json({ error: "INVALID_RESEARCH_REQUEST" }); return; }
  try {
    const worldDate = await researchWorldDate(admin);
    const { data: category } = await admin.from("research_categories").select("id").eq("id", categoryId).eq("active", true).maybeSingle();
    if (!category) { response.status(400).json({ error: "INVALID_RESEARCH_CATEGORY" }); return; }
    const { data, error } = await admin.from("research_projects").insert({
      country_key: actor.countryKey, title, category_id: categoryId, description, objective, prerequisites,
      status: "SUBMITTED", initial_investment: initialInvestment, total_investment: 0,
      requested_by_user_id: actor.userId, submitted_world_date: worldDate,
    }).select("id").single();
    if (error) throw error;
    await admin.from("research_audit_logs").insert({ project_id: data.id, country_key: actor.countryKey, actor_subject: actor.userId ?? "development", action: "SUBMITTED", details: { initialInvestment }, world_date: worldDate });
    response.status(201).json({ projectId: data.id });
  } catch (error) { console.error("research project submit failed", error); response.status(503).json({ error: "RESEARCH_DATA_UNAVAILABLE" }); }
}
