import type { ApiRequest, ApiResponse } from "../../server/types.js";
import { getAdminClient, getServerEnv } from "../../server/auth.js";
import {
  cleanCountryKey,
  currentWorldDate,
  requireDiplomacyActor,
  reviewRouteForCountry,
  type AgreementRow,
  type ProposalRow,
} from "../../server/diplomacy.js";

type RelationRow = { base_score: number };
type ModifierRow = {
  id: number;
  modifier_type: string;
  value: number;
  title: string;
  starts_world_date: string | null;
  ends_world_date: string | null;
  source_reference: string | null;
};
type HistoryRow = {
  id: number;
  previous_score: number;
  change_amount: number;
  next_score: number;
  reason: string;
  source_type: string;
  world_date: string;
  created_at: string;
};
type CooldownRow = { action_type: string; available_world_date: string };

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") {
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
  const rawTarget = Array.isArray(request.query?.targetCountryKey)
    ? request.query?.targetCountryKey[0]
    : request.query?.targetCountryKey;
  const targetCountryKey = cleanCountryKey(rawTarget);
  if (!targetCountryKey) {
    response.status(400).json({ error: "INVALID_TARGET_COUNTRY" });
    return;
  }
  if (targetCountryKey === actor.countryKey) {
    response.status(400).json({ error: "SELF_TARGET" });
    return;
  }

  try {
    const worldDate = await currentWorldDate(admin);
    const [
      outgoingBase,
      incomingBase,
      outgoingTotal,
      incomingTotal,
      outgoingModifiers,
      incomingModifiers,
      history,
      proposals,
      agreements,
      cooldowns,
      targetRoute,
    ] = await Promise.all([
      admin.from("country_relations").select("base_score")
        .eq("source_country_key", actor.countryKey).eq("target_country_key", targetCountryKey).maybeSingle<RelationRow>(),
      admin.from("country_relations").select("base_score")
        .eq("source_country_key", targetCountryKey).eq("target_country_key", actor.countryKey).maybeSingle<RelationRow>(),
      admin.rpc("tlr_relation_total", { p_source: actor.countryKey, p_target: targetCountryKey, p_world_date: worldDate }),
      admin.rpc("tlr_relation_total", { p_source: targetCountryKey, p_target: actor.countryKey, p_world_date: worldDate }),
      admin.from("country_relation_modifiers").select("id, modifier_type, value, title, starts_world_date, ends_world_date, source_reference")
        .eq("source_country_key", actor.countryKey).eq("target_country_key", targetCountryKey).returns<ModifierRow[]>(),
      admin.from("country_relation_modifiers").select("id, modifier_type, value, title, starts_world_date, ends_world_date, source_reference")
        .eq("source_country_key", targetCountryKey).eq("target_country_key", actor.countryKey).returns<ModifierRow[]>(),
      admin.from("country_relation_history").select("id, previous_score, change_amount, next_score, reason, source_type, world_date, created_at")
        .or(`and(source_country_key.eq.${actor.countryKey},target_country_key.eq.${targetCountryKey}),and(source_country_key.eq.${targetCountryKey},target_country_key.eq.${actor.countryKey})`)
        .order("world_date", { ascending: false }).order("created_at", { ascending: false }).limit(80).returns<HistoryRow[]>(),
      admin.from("diplomatic_proposals").select("*")
        .or(`and(proposer_country_key.eq.${actor.countryKey},receiver_country_key.eq.${targetCountryKey}),and(proposer_country_key.eq.${targetCountryKey},receiver_country_key.eq.${actor.countryKey})`)
        .order("created_at", { ascending: false }).limit(80).returns<ProposalRow[]>(),
      admin.from("diplomatic_agreements").select("*")
        .or(`and(country_a_key.eq.${actor.countryKey},country_b_key.eq.${targetCountryKey}),and(country_a_key.eq.${targetCountryKey},country_b_key.eq.${actor.countryKey})`)
        .order("created_at", { ascending: false }).returns<AgreementRow[]>(),
      admin.from("diplomatic_action_cooldowns").select("action_type, available_world_date")
        .eq("country_key", actor.countryKey).eq("target_country_key", targetCountryKey).returns<CooldownRow[]>(),
      reviewRouteForCountry(admin, targetCountryKey),
    ]);

    const failed = [outgoingBase, incomingBase, outgoingTotal, incomingTotal, outgoingModifiers, incomingModifiers, history, proposals, agreements, cooldowns]
      .find((result) => result.error);
    if (failed?.error) throw failed.error;
    const cooldownMap = Object.fromEntries((cooldowns.data ?? []).map((row) => [row.action_type, row.available_world_date]));
    const activeAgreementTypes = new Set((agreements.data ?? []).filter((row) => row.status === "ACTIVE" || row.status === "SCHEDULED").map((row) => row.agreement_type));
    const pendingTypes = new Set((proposals.data ?? []).filter((row) => row.status === "PENDING" && row.proposer_country_key === actor.countryKey).map((row) => row.proposal_type));
    const actionState = (id: string, proposalType?: string) => {
      const until = cooldownMap[id];
      if (until && until > worldDate) return { available: false, reason: `${until}부터 다시 실행할 수 있습니다.` };
      if (proposalType && pendingTypes.has(proposalType as ProposalRow["proposal_type"])) return { available: false, reason: "동일한 제안이 이미 응답을 기다리고 있습니다." };
      const agreementType = proposalType === "FACTION_INVITATION" ? "FACTION_MEMBERSHIP" : proposalType;
      if (agreementType && activeAgreementTypes.has(agreementType as AgreementRow["agreement_type"])) return { available: false, reason: "동일한 협정이 이미 발효 중입니다." };
      return { available: true, reason: null };
    };

    response.status(200).json({
      actorCountryKey: actor.countryKey,
      targetCountryKey,
      worldDate,
      targetReviewRoute: targetRoute,
      relations: {
        outgoing: outgoingBase.data
          ? { available: true, baseScore: outgoingBase.data.base_score, score: outgoingTotal.data, modifiers: outgoingModifiers.data ?? [] }
          : { available: false, baseScore: null, score: null, modifiers: [] },
        incoming: incomingBase.data
          ? { available: true, baseScore: incomingBase.data.base_score, score: incomingTotal.data, modifiers: incomingModifiers.data ?? [] }
          : { available: false, baseScore: null, score: null, modifiers: [] },
      },
      actions: {
        IMPROVE_RELATIONS: actionState("IMPROVE_RELATIONS"),
        WORSEN_RELATIONS: actionState("WORSEN_RELATIONS"),
        NON_AGGRESSION: actionState("NON_AGGRESSION", "NON_AGGRESSION"),
        TRADE_AGREEMENT: actionState("TRADE_AGREEMENT", "TRADE_AGREEMENT"),
        FACTION_INVITATION: actionState("FACTION_INVITATION", "FACTION_INVITATION"),
        MILITARY_ACCESS: actionState("MILITARY_ACCESS", "MILITARY_ACCESS"),
        INDEPENDENCE_GUARANTEE: actionState("INDEPENDENCE_GUARANTEE", "INDEPENDENCE_GUARANTEE"),
        SEND_MESSAGE: { available: false, reason: "공식 전문 시스템은 아직 개통되지 않았습니다." },
        INTELLIGENCE_NETWORK: { available: false, reason: "첩보망 구축은 정보기관 기능과 함께 제공됩니다." },
      },
      proposals: proposals.data ?? [],
      agreements: agreements.data ?? [],
      history: history.data ?? [],
    });
  } catch (error) {
    console.error("diplomacy overview failed", error);
    response.status(503).json({ error: "DIPLOMACY_DATA_UNAVAILABLE" });
  }
}
