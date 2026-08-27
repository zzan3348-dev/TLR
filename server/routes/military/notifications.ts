import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { cleanUuid, requireMilitaryActor } from "../../military.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!request.method || !["GET", "PATCH"].includes(request.method)) { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "MILITARY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireMilitaryActor(request, response, admin);
  if (!actor) return;
  if (request.method === "GET") {
    const rows = await admin.from("military_notifications").select("*")
      .eq("country_key", actor.countryKey).eq("notification_type", "WAR_DECLARATION")
      .is("read_at", null).order("created_at").limit(10);
    if (rows.error) { response.status(503).json({ error: "MILITARY_NOTIFICATIONS_UNAVAILABLE" }); return; }
    response.status(200).json(rows.data ?? []); return;
  }
  const id = cleanUuid((request.body as { id?: unknown } | null)?.id);
  if (!id) { response.status(400).json({ error: "INVALID_NOTIFICATION" }); return; }
  const updated = await admin.from("military_notifications").update({ read_at: new Date().toISOString() })
    .eq("id", id).eq("country_key", actor.countryKey).is("read_at", null).select("id").maybeSingle();
  if (updated.error) { response.status(503).json({ error: "MILITARY_NOTIFICATION_UPDATE_FAILED" }); return; }
  response.status(200).json({ ok: true });
}
