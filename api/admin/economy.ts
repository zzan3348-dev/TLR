import type { ApiRequest, ApiResponse } from "../../server/types";
import { getAdminClient, getServerEnv } from "../../server/auth";
import { requireAdminSession } from "../../server/adminAuth";
import { economyDatabaseError, economyWorldDate } from "../../server/economy";

const ECONOMY_FIELDS = new Set([
  "gdp", "nominal_growth_rate", "inflation_rate", "unemployment_rate", "national_debt",
  "foreign_reserves", "national_income", "total_expenditure", "base_production_capacity",
  "production_capacity_modifier", "domestic_capacity_used", "research_capacity",
  "budget_fulfillment_rate", "nominal_tax_rate", "tax_collection_efficiency",
]);

const BUDGET_FIELDS = ["administration", "defense", "industry", "welfare", "education"] as const;

function cleanNumberPatch(value: unknown): Record<string, number | null> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: Record<string, number | null> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!ECONOMY_FIELDS.has(key) || (raw !== null && (typeof raw !== "number" || !Number.isFinite(raw)))) return null;
    result[key] = raw as number | null;
  }
  return Object.keys(result).length ? result : null;
}

function cleanBudget(value: unknown): Record<(typeof BUDGET_FIELDS)[number], number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const entries = BUDGET_FIELDS.map((field) => [field, source[field]] as const);
  if (entries.some(([, raw]) => typeof raw !== "number" || !Number.isFinite(raw) || raw < 0)) return null;
  const total = entries.reduce((sum, [, raw]) => sum + (raw as number), 0);
  if (Math.abs(total - 100) > 0.01) return null;
  return Object.fromEntries(entries) as Record<(typeof BUDGET_FIELDS)[number], number>;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const session = requireAdminSession(request, response);
  if (!session) return;
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "ECONOMY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  try {
    const worldDate = await economyWorldDate(admin);
    if (request.method === "GET") {
      const [queue, agreements, economies, resources, settlements, history, restrictions] = await Promise.all([
        admin.from("trade_proposals").select("*,lines:trade_proposal_lines(*)").eq("review_route", "ADMIN").eq("status", "PENDING").order("created_at"),
        admin.from("trade_agreements").select("*,lines:trade_agreement_lines(*)").in("status", ["SCHEDULED", "ACTIVE", "SUSPENDED", "BREACHED"]).order("created_at", { ascending: false }).limit(100),
        admin.from("country_economies").select("country_key,gdp,base_production_capacity,updated_at").order("country_key"),
        admin.from("country_resources").select("*").order("country_key").order("resource_type_id"),
        admin.from("trade_settlements").select("*").order("scheduled_world_date", { ascending: false }).limit(100),
        admin.from("economy_history").select("*").order("created_at", { ascending: false }).limit(100),
        admin.from("country_trade_restrictions").select("*").order("created_at", { ascending: false }).limit(100),
      ]);
      const failed = [queue, agreements, economies, resources, settlements, history, restrictions].find((result) => result.error);
      if (failed?.error) throw failed.error;
      response.status(200).json({ worldDate, queue: queue.data ?? [], agreements: agreements.data ?? [], economies: economies.data ?? [], resources: resources.data ?? [], settlements: settlements.data ?? [], history: history.data ?? [], restrictions: restrictions.data ?? [] }); return;
    }
    if (request.method === "POST") {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
      const action = typeof body.action === "string" ? body.action : "";
      if (action === "PREVIEW_PERIOD" || action === "RUN_PERIOD") {
        const countryKey = typeof body.countryKey === "string" ? body.countryKey : "";
        const periodStart = typeof body.periodStart === "string" ? body.periodStart : "";
        const periodEnd = typeof body.periodEnd === "string" ? body.periodEnd : worldDate;
        if (!countryKey || !/^\d{4}-\d{2}-\d{2}$/u.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/u.test(periodEnd)) {
          response.status(400).json({ error: "INVALID_ECONOMY_PERIOD" }); return;
        }
        const functionName = action === "PREVIEW_PERIOD" ? "tlr_preview_economy_period" : "tlr_run_economy_period";
        const { data, error } = await admin.rpc(functionName, {
          p_country: countryKey, p_period_start: periodStart, p_period_end: periodEnd,
        });
        if (error) throw error;
        response.status(200).json(action === "PREVIEW_PERIOD" ? { ok: true, preview: data } : { ok: true, historyId: data }); return;
      }
      if (action === "UPSERT_ECONOMY") {
        const countryKey = typeof body.countryKey === "string" ? body.countryKey : "";
        const values = cleanNumberPatch(body.values);
        const budget = body.currentBudget === undefined ? undefined : cleanBudget(body.currentBudget);
        if (!countryKey || (!values && budget === undefined) || budget === null) { response.status(400).json({ error: "INVALID_ECONOMY_PATCH" }); return; }
        const patch: Record<string, unknown> = { country_key: countryKey, ...(values ?? {}), updated_at: new Date().toISOString() };
        if (budget !== undefined) patch.current_budget = budget;
        const { error } = await admin.from("country_economies").upsert(patch, { onConflict: "country_key" });
        if (error) throw error;
        response.status(200).json({ ok: true }); return;
      }
      if (action === "UPSERT_RESOURCE") {
        const countryKey = typeof body.countryKey === "string" ? body.countryKey : "";
        const resourceTypeId = typeof body.resourceTypeId === "string" ? body.resourceTypeId : "";
        const fields = ["stockpile", "production_per_period", "domestic_use", "export_limit"] as const;
        const values: Record<string, number | null> = {};
        for (const field of fields) {
          const raw = body[field];
          if (raw !== undefined && raw !== null && (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0)) { response.status(400).json({ error: "INVALID_RESOURCE_PATCH" }); return; }
          if (raw !== undefined) values[field] = raw as number | null;
        }
        if (!countryKey || !resourceTypeId || !Object.keys(values).length) { response.status(400).json({ error: "INVALID_RESOURCE_PATCH" }); return; }
        const { error } = await admin.from("country_resources").upsert({ country_key: countryKey, resource_type_id: resourceTypeId, ...values, updated_at: new Date().toISOString() }, { onConflict: "country_key,resource_type_id" });
        if (error) throw error;
        response.status(200).json({ ok: true }); return;
      }
      if (["SUSPEND_AGREEMENT", "RESTORE_AGREEMENT", "TERMINATE_AGREEMENT"].includes(action)) {
        const agreementId = typeof body.agreementId === "string" ? body.agreementId : "";
        const nextStatus = action === "SUSPEND_AGREEMENT" ? "SUSPENDED" : action === "RESTORE_AGREEMENT" ? "ACTIVE" : "TERMINATED";
        if (!agreementId) { response.status(400).json({ error: "INVALID_TRADE_AGREEMENT" }); return; }
        const { data: agreement, error: agreementError } = await admin.from("trade_agreements").select("country_a_key,country_b_key,status").eq("id", agreementId).maybeSingle<{ country_a_key: string; country_b_key: string; status: string }>();
        if (agreementError) throw agreementError;
        if (!agreement) { response.status(404).json({ error: "TRADE_AGREEMENT_NOT_FOUND" }); return; }
        const allowed = action === "RESTORE_AGREEMENT" ? ["SUSPENDED", "BREACHED"] : ["SCHEDULED", "ACTIVE", "SUSPENDED", "BREACHED"];
        if (!allowed.includes(agreement.status)) { response.status(409).json({ error: "TRADE_AGREEMENT_CLOSED" }); return; }
        const update: Record<string, unknown> = { status: nextStatus, updated_at: new Date().toISOString() };
        if (nextStatus === "TERMINATED") update.next_settlement_world_date = null;
        if (nextStatus === "ACTIVE") update.next_settlement_world_date = worldDate;
        const { error } = await admin.from("trade_agreements").update(update).eq("id", agreementId).eq("status", agreement.status);
        if (error) throw error;
        await admin.from("trade_admin_reviews").insert({ agreement_id: agreementId, admin_subject: session.sub, admin_kind: session.kind, action, note: typeof body.note === "string" ? body.note.slice(0, 500) : null, world_date: worldDate });
        response.status(200).json({ ok: true, status: nextStatus }); return;
      }
      if (action === "SET_RESTRICTION") {
        const countryKey = typeof body.countryKey === "string" ? body.countryKey : "";
        const targetCountryKey = typeof body.targetCountryKey === "string" && body.targetCountryKey ? body.targetCountryKey : null;
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
        const endsWorldDate = typeof body.endsWorldDate === "string" && body.endsWorldDate ? body.endsWorldDate : null;
        if (!countryKey || !reason) { response.status(400).json({ error: "INVALID_TRADE_RESTRICTION" }); return; }
        const { error } = await admin.from("country_trade_restrictions").insert({ country_key: countryKey, target_country_key: targetCountryKey, reason, starts_world_date: worldDate, ends_world_date: endsWorldDate });
        if (error) throw error;
        response.status(200).json({ ok: true }); return;
      }
      if (action === "CLEAR_RESTRICTION") {
        const restrictionId = typeof body.restrictionId === "number" ? body.restrictionId : null;
        if (!restrictionId) { response.status(400).json({ error: "INVALID_TRADE_RESTRICTION" }); return; }
        const { error } = await admin.from("country_trade_restrictions").update({ ends_world_date: worldDate }).eq("id", restrictionId);
        if (error) throw error;
        response.status(200).json({ ok: true }); return;
      }
      const { data: proposal, error: proposalError } = await admin.from("trade_proposals").select("*").eq("id", proposalId).eq("review_route", "ADMIN").maybeSingle<{ receiver_country_key: string; status: string }>();
      if (proposalError) throw proposalError;
      if (!proposal || proposal.status !== "PENDING") { response.status(404).json({ error: "ADMIN_REVIEW_NOT_FOUND" }); return; }
      if (action !== "ACCEPT" && action !== "REJECT") { response.status(400).json({ error: "INVALID_ADMIN_ACTION" }); return; }
      const status = action === "ACCEPT" ? "ACCEPTED" : "REJECTED";
      const { data, error } = await admin.rpc("tlr_respond_trade_proposal", { p_proposal_id: proposalId, p_receiver: proposal.receiver_country_key, p_response: status, p_user_id: null, p_world_date: worldDate });
      if (error) throw error;
      await admin.from("trade_admin_reviews").insert({ proposal_id: proposalId, agreement_id: data, admin_subject: session.sub, admin_kind: session.kind, action: status, note: typeof body.note === "string" ? body.note.slice(0, 500) : null, world_date: worldDate });
      response.status(200).json({ ok: true, status, agreementId: data }); return;
    }
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    response.status(500).json({ error: economyDatabaseError(error) });
  }
}
