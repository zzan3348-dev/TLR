import { getAdminClient, getServerEnv } from "../../auth.js";
import { decisionOverview, loadDecisionRuntime } from "../../decisions.js";
import { requireDiplomacyActor } from "../../diplomacy.js";
import type { ApiRequest, ApiResponse } from "../../types.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "DECISION_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireDiplomacyActor(request, response, admin);
  if (!actor) return;
  try {
    response.status(200).json(decisionOverview(actor.countryKey, await loadDecisionRuntime(admin, actor.countryKey)));
  } catch (error) {
    console.error("decision overview failed", error);
    response.status(503).json({ error: "DECISION_DATA_UNAVAILABLE" });
  }
}
