import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { requireEconomyActor } from "../../economy.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "ECONOMY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireEconomyActor(request, response, admin);
  if (!actor) return;
  try {
    if (request.method === "GET") {
      const { data, error } = await admin.from("trade_notifications").select("*,proposal:trade_proposals(*,lines:trade_proposal_lines(*)),agreement:trade_agreements(*,lines:trade_agreement_lines(*))")
        .eq("country_key", actor.countryKey).is("dismissed_at", null).order("created_at", { ascending: true }).limit(50);
      if (error) throw error;
      response.status(200).json({ notifications: data ?? [] }); return;
    }
    if (request.method === "PATCH") {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      const id = typeof body.notificationId === "string" ? body.notificationId : "";
      const field = body.action === "DISMISS" ? "dismissed_at" : body.action === "READ" ? "read_at" : null;
      if (!id || !field) { response.status(400).json({ error: "INVALID_NOTIFICATION_ACTION" }); return; }
      const { error } = await admin.from("trade_notifications").update({ [field]: new Date().toISOString() }).eq("id", id).eq("country_key", actor.countryKey);
      if (error) throw error;
      response.status(200).json({ ok: true }); return;
    }
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    console.error("trade notification failed", error);
    response.status(503).json({ error: "TRADE_DATA_UNAVAILABLE" });
  }
}
