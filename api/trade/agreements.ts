import type { ApiRequest, ApiResponse } from "../../server/types.js";
import { getAdminClient, getServerEnv } from "../../server/auth.js";
import { economyDatabaseError, economyWorldDate, requireEconomyActor } from "../../server/economy.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "ECONOMY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireEconomyActor(request, response, admin);
  if (!actor) return;
  try {
    const worldDate = await economyWorldDate(admin);
    if (request.method === "GET") {
      const { data, error } = await admin.from("trade_agreements").select("*,lines:trade_agreement_lines(*),settlements:trade_settlements(*)")
        .or(`country_a_key.eq.${actor.countryKey},country_b_key.eq.${actor.countryKey}`)
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      response.status(200).json({ worldDate, agreements: data ?? [] }); return;
    }
    if (request.method === "PATCH") {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      const agreementId = typeof body.agreementId === "string" ? body.agreementId : "";
      if (body.action !== "TERMINATE" || !agreementId) { response.status(400).json({ error: "INVALID_AGREEMENT_ACTION" }); return; }
      const { error } = await admin.rpc("tlr_terminate_trade_agreement", { p_agreement_id: agreementId, p_country: actor.countryKey, p_user_id: actor.userId, p_world_date: worldDate });
      if (error) throw error;
      response.status(200).json({ ok: true, status: "TERMINATED" }); return;
    }
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const code = economyDatabaseError(error);
    response.status(code.includes("NOT_FOUND") ? 404 : code.includes("NOT_ALLOWED") || code.includes("CLOSED") ? 409 : 500).json({ error: code });
  }
}
