import { getAdminClient, getServerEnv } from "../../auth.js";
import { decisionError, executeCommonDecision } from "../../decisions.js";
import { requireDiplomacyActor } from "../../diplomacy.js";
import type { ApiRequest, ApiResponse } from "../../types.js";

type ExecuteBody = { decisionId?: unknown; targetPartyId?: unknown };

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "POST") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "DECISION_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireDiplomacyActor(request, response, admin);
  if (!actor) return;
  const body = request.body && typeof request.body === "object" ? request.body as ExecuteBody : {};
  const decisionId = typeof body.decisionId === "string" ? body.decisionId : "";
  const targetPartyId = typeof body.targetPartyId === "string" ? body.targetPartyId : undefined;
  try {
    response.status(200).json(await executeCommonDecision(admin, actor.countryKey, actor.userId, decisionId, targetPartyId));
  } catch (error) {
    const code = decisionError(error);
    response.status(code === "DECISION_NOT_FOUND" ? 404 : code === "DECISION_DATA_UNAVAILABLE" ? 503 : 409).json({ error: code });
  }
}
