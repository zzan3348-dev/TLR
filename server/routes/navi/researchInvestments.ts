import { randomUUID } from "node:crypto";
import type { ApiRequest, ApiResponse } from "../../types.js";
import { requireNaviActor, requireNaviAdminClient } from "../../naviAuth.js";
import { cleanPositiveNumber, cleanText, researchDatabaseError, researchWorldDate } from "../../research.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "POST") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const admin = requireNaviAdminClient(response);
  if (!admin) return;
  const actor = await requireNaviActor(request, response, admin);
  if (!actor) return;
  const body = request.body && typeof request.body === "object"
    ? request.body as Record<string, unknown>
    : {};
  const action = cleanText(body.action, 20);
  const projectId = cleanText(body.projectId, 80);
  const amount = cleanPositiveNumber(body.amount);
  if (!projectId || !amount || !["PREVIEW", "CONFIRM"].includes(action)) {
    response.status(400).json({ error: "INVALID_RESEARCH_INVESTMENT" });
    return;
  }
  const { data: project, error: projectError } = await admin
    .from("research_projects")
    .select("id,country_key,status")
    .eq("id", projectId)
    .maybeSingle<{ id: string; country_key: string; status: string }>();
  if (projectError) {
    response.status(503).json({ error: "RESEARCH_DATA_UNAVAILABLE" });
    return;
  }
  if (!project || project.country_key !== actor.countryKey) {
    response.status(404).json({ error: "RESEARCH_PROJECT_NOT_FOUND" });
    return;
  }
  try {
    const worldDate = await researchWorldDate(admin);
    if (action === "PREVIEW") {
      const { data, error } = await admin.rpc("tlr_preview_research_investment", {
        p_project: projectId,
        p_amount: amount,
        p_world_date: worldDate,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const currentDate = String(row.current_completion_date);
      const projectedDate = String(row.projected_completion_date);
      const daysSaved = Math.max(0, Math.round(
        (Date.parse(`${currentDate}T00:00:00Z`) - Date.parse(`${projectedDate}T00:00:00Z`)) / 86_400_000,
      ));
      const balanceAfter = Number(row.balance_after);
      response.status(200).json({
        preview: {
          amount: Number(row.amount),
          currentCompletionDate: currentDate,
          projectedCompletionDate: projectedDate,
          daysSaved,
          balanceBefore: balanceAfter + Number(row.amount),
          balanceAfter,
        },
      });
      return;
    }
    const suppliedKey = cleanText(body.idempotencyKey, 120);
    const idempotencyKey = suppliedKey || `navi:${actor.discordUserId}:${randomUUID()}`;
    const { data, error } = await admin.rpc("tlr_invest_research_project", {
      p_project: projectId,
      p_amount: amount,
      p_world_date: worldDate,
      p_idempotency_key: idempotencyKey,
      p_user: actor.profileId,
    });
    if (error) throw error;
    response.status(200).json({ ok: true, scheduledCompletionWorldDate: data });
  } catch (error) {
    response.status(409).json({ error: researchDatabaseError(error) });
  }
}
