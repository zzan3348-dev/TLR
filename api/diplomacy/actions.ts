import type { ApiRequest, ApiResponse } from "../../server/types";
import { getAdminClient, getServerEnv } from "../../server/auth";
import { cleanCountryKey, currentWorldDate, databaseErrorCode, requireDiplomacyActor } from "../../server/diplomacy";

const actionTypes = new Set(["IMPROVE_RELATIONS", "WORSEN_RELATIONS"]);

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "POST") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const env = getServerEnv();
  if (!env) {
    response.status(503).json({ error: "DIPLOMACY_SERVER_NOT_CONFIGURED" });
    return;
  }
  const admin = getAdminClient(env);
  const actor = await requireDiplomacyActor(request, response, admin);
  if (!actor) return;
  const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
  const target = cleanCountryKey(body.targetCountryKey);
  const actionType = typeof body.actionType === "string" ? body.actionType : "";
  if (!target || !actionTypes.has(actionType)) {
    response.status(400).json({ error: "INVALID_ACTION" });
    return;
  }
  if (target === actor.countryKey) {
    response.status(400).json({ error: "SELF_TARGET" });
    return;
  }
  try {
    const worldDate = await currentWorldDate(admin);
    const { data, error } = await admin.rpc("tlr_apply_diplomatic_action", {
      p_source: actor.countryKey,
      p_target: target,
      p_action_type: actionType,
      p_world_date: worldDate,
    });
    if (error) throw error;
    response.status(200).json({ ok: true, score: data, worldDate });
  } catch (error) {
    const code = databaseErrorCode(error);
    response.status(code === "ACTION_COOLDOWN" ? 409 : 500).json({ error: code });
  }
}
