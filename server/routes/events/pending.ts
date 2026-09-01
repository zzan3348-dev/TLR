import { getAdminClient, getServerEnv } from "../../auth.js";
import { requireDiplomacyActor } from "../../diplomacy.js";
import { loadPendingEvents } from "../../eventRuntime.js";
import type { ApiRequest, ApiResponse } from "../../types.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") return void response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  const env = getServerEnv();
  if (!env) return void response.status(503).json({ error: "EVENT_SERVER_NOT_CONFIGURED" });
  const admin = getAdminClient(env);
  const actor = await requireDiplomacyActor(request, response, admin);
  if (!actor) return;
  try {
    response.status(200).json({ events: await loadPendingEvents(admin, actor.countryKey) });
  } catch (error) {
    console.error("pending events failed", error);
    response.status(503).json({ error: "EVENT_DELIVERY_UNAVAILABLE" });
  }
}
