import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { cleanPositiveNumber, cleanText, requireProjectOwner, researchDatabaseError, researchWorldDate } from "../../research.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "POST") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "RESEARCH_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
  const action = cleanText(body.action, 20), projectId = cleanText(body.projectId, 80), amount = cleanPositiveNumber(body.amount);
  if (!projectId || !amount || !["PREVIEW","CONFIRM"].includes(action)) { response.status(400).json({ error: "INVALID_RESEARCH_INVESTMENT" }); return; }
  const ownership = await requireProjectOwner(request, response, admin, projectId);
  if (!ownership) return;
  try {
    const worldDate = await researchWorldDate(admin);
    if (action === "PREVIEW") {
      const { data, error } = await admin.rpc("tlr_preview_research_investment", { p_project: projectId, p_amount: amount, p_world_date: worldDate });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      response.status(200).json({ preview: { amount: Number(row.amount), currentCompletionDate: row.current_completion_date, projectedCompletionDate: row.projected_completion_date, balanceAfter: Number(row.balance_after) } }); return;
    }
    const idempotencyKey = cleanText(body.idempotencyKey, 120);
    if (!idempotencyKey) { response.status(400).json({ error: "INVALID_IDEMPOTENCY_KEY" }); return; }
    const { data, error } = await admin.rpc("tlr_invest_research_project", { p_project: projectId, p_amount: amount, p_world_date: worldDate, p_idempotency_key: idempotencyKey, p_user: ownership.actor.userId ?? "development" });
    if (error) throw error;
    response.status(200).json({ ok: true, scheduledCompletionWorldDate: data });
  } catch (error) { response.status(409).json({ error: researchDatabaseError(error) }); }
}
