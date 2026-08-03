import type { ApiRequest, ApiResponse } from "../../server/types.js";
import { getAdminClient, getServerEnv } from "../../server/auth.js";
import {
  cleanCountryKey,
  cleanDate,
  cleanTerms,
  currentWorldDate,
  databaseErrorCode,
  proposalById,
  proposalType,
  requireDiplomacyActor,
  reviewRouteForCountry,
  type ProposalRow,
} from "../../server/diplomacy.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const env = getServerEnv();
  if (!env) {
    response.status(503).json({ error: "DIPLOMACY_SERVER_NOT_CONFIGURED" });
    return;
  }
  const admin = getAdminClient(env);
  const actor = await requireDiplomacyActor(request, response, admin);
  if (!actor) return;

  if (request.method === "GET") {
    try {
      const worldDate = await currentWorldDate(admin);
      const { data, error } = await admin.from("diplomatic_proposals").select("*")
        .or(`proposer_country_key.eq.${actor.countryKey},receiver_country_key.eq.${actor.countryKey}`)
        .order("response_deadline_world_date", { ascending: true }).order("created_at", { ascending: true }).limit(200).returns<ProposalRow[]>();
      if (error) throw error;
      response.status(200).json({ worldDate, proposals: data ?? [] });
    } catch (error) {
      console.error("proposal list failed", error);
      response.status(503).json({ error: "DIPLOMACY_DATA_UNAVAILABLE" });
    }
    return;
  }

  const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
  try {
    const worldDate = await currentWorldDate(admin);
    if (request.method === "POST") {
      const target = cleanCountryKey(body.targetCountryKey);
      const type = proposalType(body.proposalType);
      const deadline = cleanDate(body.deadlineWorldDate);
      const starts = body.startsWorldDate === null ? null : cleanDate(body.startsWorldDate);
      const ends = body.endsWorldDate === null ? null : cleanDate(body.endsWorldDate);
      if (!target || !type || !deadline || (body.startsWorldDate !== null && !starts) || (body.endsWorldDate !== null && !ends)) {
        response.status(400).json({ error: "INVALID_PROPOSAL" });
        return;
      }
      if (target === actor.countryKey) {
        response.status(400).json({ error: "SELF_TARGET" });
        return;
      }
      const route = await reviewRouteForCountry(admin, target);
      const { data, error } = await admin.rpc("tlr_create_diplomatic_proposal", {
        p_proposer: actor.countryKey,
        p_receiver: target,
        p_type: type,
        p_review_route: route,
        p_terms: cleanTerms(body.terms),
        p_start: starts ?? worldDate,
        p_end: ends,
        p_deadline: deadline,
        p_world_date: worldDate,
      });
      if (error) throw error;
      response.status(201).json({ ok: true, proposalId: data, reviewRoute: route, worldDate });
      return;
    }
    if (request.method === "PATCH") {
      const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
      const action = typeof body.action === "string" ? body.action : "";
      const proposal = await proposalById(admin, proposalId);
      if (!proposal) {
        response.status(404).json({ error: "PROPOSAL_NOT_FOUND" });
        return;
      }
      if (action === "WITHDRAW") {
        if (proposal.proposer_country_key !== actor.countryKey) {
          response.status(403).json({ error: "NOT_PROPOSAL_PROPOSER" });
          return;
        }
        const { error } = await admin.rpc("tlr_withdraw_diplomatic_proposal", {
          p_proposal_id: proposalId,
          p_proposer: actor.countryKey,
          p_world_date: worldDate,
        });
        if (error) throw error;
        response.status(200).json({ ok: true, status: "WITHDRAWN" });
        return;
      }
      if (action === "ACCEPT" || action === "REJECT") {
        if (proposal.receiver_country_key !== actor.countryKey || proposal.review_route !== "PLAYER") {
          response.status(403).json({ error: "NOT_PROPOSAL_RECEIVER" });
          return;
        }
        const status = action === "ACCEPT" ? "ACCEPTED" : "REJECTED";
        const { data, error } = await admin.rpc("tlr_respond_diplomatic_proposal", {
          p_proposal_id: proposalId,
          p_receiver: actor.countryKey,
          p_response: status,
          p_user_id: actor.userId,
          p_world_date: worldDate,
        });
        if (error) throw error;
        response.status(200).json({ ok: true, status, agreementId: data });
        return;
      }
      response.status(400).json({ error: "INVALID_PROPOSAL_ACTION" });
      return;
    }
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    const code = databaseErrorCode(error);
    const conflict = new Set(["DUPLICATE_PENDING_PROPOSAL", "AGREEMENT_EXISTS", "PROPOSAL_NOT_PENDING", "PROPOSAL_EXPIRED"]);
    const invalid = new Set(["INVALID_DEADLINE", "INVALID_START_DATE", "INVALID_END_DATE"]);
    response.status(conflict.has(code) ? 409 : invalid.has(code) ? 400 : code.endsWith("NOT_FOUND") ? 404 : 500).json({ error: code });
  }
}
