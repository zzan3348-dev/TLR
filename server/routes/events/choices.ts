import { getAdminClient, getServerEnv } from "../../auth.js";
import { requireDiplomacyActor } from "../../diplomacy.js";
import {
  eventEffectError,
  executeEventChoice,
  parseEventExecutionBody,
} from "../../eventEffects.js";
import type { ApiRequest, ApiResponse } from "../../types.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "POST") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const env = getServerEnv();
  if (!env) {
    response.status(503).json({ error: "EVENT_EFFECT_SERVER_NOT_CONFIGURED" });
    return;
  }
  const admin = getAdminClient(env);
  const actor = await requireDiplomacyActor(request, response, admin);
  if (!actor) return;
  const identifiers = parseEventExecutionBody(request.body);
  if (!identifiers) {
    response.status(400).json({ error: "INVALID_EVENT_EXECUTION" });
    return;
  }
  try {
    response.status(200).json(await executeEventChoice(admin, actor, identifiers));
  } catch (error) {
    const code = eventEffectError(error);
    response.status(code === "EVENT_CHOICE_NOT_FOUND" ? 404 : code === "EVENT_DATA_UNAVAILABLE" ? 503 : 409).json({ error: code });
  }
}
