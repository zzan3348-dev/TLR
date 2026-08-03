/// <reference types="node" />
import { randomUUID } from "node:crypto";
import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { cleanCountryKey, cleanDate } from "../../diplomacy.js";
import { cleanTradeLines, economyDatabaseError, economyWorldDate, requireEconomyActor, tradeReviewRoute } from "../../economy.js";

type ProposalRow = { id: string; proposer_country_key: string; receiver_country_key: string; review_route: "PLAYER" | "ADMIN"; status: string };

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "ECONOMY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireEconomyActor(request, response, admin);
  if (!actor) return;
  try {
    const worldDate = await economyWorldDate(admin);
    if (request.method === "GET") {
      const { data, error } = await admin.from("trade_proposals").select("*,lines:trade_proposal_lines(*)")
        .or(`proposer_country_key.eq.${actor.countryKey},receiver_country_key.eq.${actor.countryKey}`)
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      response.status(200).json({ worldDate, proposals: data ?? [] }); return;
    }
    const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
    if (request.method === "POST") {
      const target = cleanCountryKey(body.targetCountryKey);
      const start = cleanDate(body.startWorldDate);
      const end = cleanDate(body.endWorldDate);
      const deadline = cleanDate(body.responseDeadlineWorldDate);
      const interval = typeof body.settlementIntervalDays === "number" && Number.isInteger(body.settlementIntervalDays) ? body.settlementIntervalDays : 30;
      if (!target || target === actor.countryKey || !start || !end || !deadline || interval < 1 || interval > 365) {
        response.status(400).json({ error: "INVALID_TRADE_PROPOSAL" }); return;
      }
      const lines = cleanTradeLines(body.lines, actor.countryKey, target);
      if (!lines) { response.status(400).json({ error: "INVALID_TRADE_LINES" }); return; }
      const route = await tradeReviewRoute(admin, target);
      const { data, error } = await admin.rpc("tlr_create_trade_proposal", {
        p_proposer: actor.countryKey, p_receiver: target, p_review_route: route, p_lines: lines,
        p_start: start, p_end: end, p_interval: interval, p_deadline: deadline,
        p_auto_renew: body.autoRenew === true, p_allow_early: body.allowEarlyTermination !== false,
        p_allow_partial: body.allowPartialFulfillment === true,
        p_idempotency_key: typeof body.idempotencyKey === "string" && body.idempotencyKey.length <= 100 ? body.idempotencyKey : randomUUID(),
        p_world_date: worldDate,
      });
      if (error) throw error;
      response.status(201).json({ ok: true, proposalId: data, reviewRoute: route }); return;
    }
    if (request.method === "PATCH") {
      const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
      const action = typeof body.action === "string" ? body.action : "";
      const { data: proposal, error: proposalError } = await admin.from("trade_proposals").select("id,proposer_country_key,receiver_country_key,review_route,status").eq("id", proposalId).maybeSingle<ProposalRow>();
      if (proposalError) throw proposalError;
      if (!proposal) { response.status(404).json({ error: "TRADE_PROPOSAL_NOT_FOUND" }); return; }
      if (action === "WITHDRAW") {
        if (proposal.proposer_country_key !== actor.countryKey) { response.status(403).json({ error: "NOT_TRADE_PROPOSER" }); return; }
        const { error } = await admin.rpc("tlr_withdraw_trade_proposal", { p_proposal_id: proposalId, p_proposer: actor.countryKey, p_user_id: actor.userId, p_world_date: worldDate });
        if (error) throw error;
        response.status(200).json({ ok: true, status: "WITHDRAWN" }); return;
      }
      if ((action === "ACCEPT" || action === "REJECT") && proposal.receiver_country_key === actor.countryKey && proposal.review_route === "PLAYER") {
        const status = action === "ACCEPT" ? "ACCEPTED" : "REJECTED";
        const { data, error } = await admin.rpc("tlr_respond_trade_proposal", { p_proposal_id: proposalId, p_receiver: actor.countryKey, p_response: status, p_user_id: actor.userId, p_world_date: worldDate });
        if (error) throw error;
        response.status(200).json({ ok: true, status, agreementId: data }); return;
      }
      response.status(403).json({ error: "TRADE_ACTION_NOT_ALLOWED" }); return;
    }
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const code = economyDatabaseError(error);
    const conflict = code.includes("PENDING") || code.includes("INSUFFICIENT") || code.includes("READY") || code.includes("RESTRICTED");
    response.status(conflict ? 409 : code.includes("INVALID") ? 400 : code.includes("NOT_FOUND") ? 404 : 500).json({ error: code });
  }
}
