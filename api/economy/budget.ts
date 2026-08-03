import type { ApiRequest, ApiResponse } from "../../server/types";
import { getAdminClient, getServerEnv } from "../../server/auth";
import { cleanBudget, economyDatabaseError, economyWorldDate, requireEconomyActor } from "../../server/economy";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "ECONOMY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireEconomyActor(request, response, admin);
  if (!actor) return;
  if (request.method !== "POST") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
  const action = typeof body.action === "string" ? body.action : "";
  try {
    const worldDate = await economyWorldDate(admin);
    if (action === "SAVE_DRAFT") {
      const budget = cleanBudget(body.budget);
      if (!budget) { response.status(400).json({ error: "INVALID_BUDGET" }); return; }
      const { error } = await admin.rpc("tlr_save_budget_draft", { p_country: actor.countryKey, p_budget: budget });
      if (error) throw error;
      response.status(200).json({ ok: true, status: "DRAFT_SAVED" });
      return;
    }
    if (action === "CONFIRM") {
      const { error } = await admin.rpc("tlr_confirm_budget", { p_country: actor.countryKey, p_world_date: worldDate });
      if (error) throw error;
      response.status(200).json({ ok: true, status: "SCHEDULED", worldDate });
      return;
    }
    response.status(400).json({ error: "INVALID_BUDGET_ACTION" });
  } catch (error) {
    const code = economyDatabaseError(error);
    response.status(code === "INVALID_BUDGET" ? 400 : code.includes("REQUIRED") || code.includes("UNCONFIGURED") ? 409 : 500).json({ error: code });
  }
}
