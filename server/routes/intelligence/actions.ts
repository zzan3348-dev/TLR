import { randomUUID } from "node:crypto";
import { getAdminClient, getServerEnv, type AdminClient } from "../../auth.js";
import { currentWorldDate, requireDiplomacyActor } from "../../diplomacy.js";
import { confidenceForInfiltration, estimateRange, operationScores } from "../../intelligenceEngine.js";
import { loadCalculatedNationalStats } from "../../countryNationalStats.js";
import { worldTurn } from "../../decisions.js";
import type { ApiRequest, ApiResponse } from "../../types.js";

const DOMAINS = new Set(["ECONOMY", "ADMINISTRATION_POLITICS", "RESEARCH", "MILITARY", "UNDERGROUND"]);
const INFILTRATION_COLUMNS: Record<string, string> = { ECONOMY: "economy_infiltration", ADMINISTRATION_POLITICS: "administration_politics_infiltration", RESEARCH: "research_infiltration", MILITARY: "military_infiltration", UNDERGROUND: "underground_infiltration" };
function bodyOf(request: ApiRequest): Record<string, unknown> { return request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {}; }
function country(value: unknown): string | null { return typeof value === "string" && /^country-\d{3}$/u.test(value) ? value : null; }
function key(value: unknown): string | null { return typeof value === "string" && /^[a-z0-9][a-z0-9_]*$/u.test(value) ? value : null; }
function datePlus(date: string, days: number): string { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
async function chargePoliticalPower(admin: AdminClient, countryKey: string, amount: number): Promise<void> {
  const result = await admin.rpc("tlr_charge_intelligence_political_power", { p_country: countryKey, p_amount: amount });
  if (result.error) throw new Error(result.error.message.includes("INSUFFICIENT") ? "INSUFFICIENT_POLITICAL_POWER" : result.error.message.includes("UNSET") ? "POLITICAL_POWER_UNSET" : "POLITICAL_POWER_CHARGE_FAILED");
}
async function snapshotPayload(admin: AdminClient, target: string, domain: string, confidence: ReturnType<typeof confidenceForInfiltration>, worldDate: string): Promise<Record<string, unknown>> {
  if (domain === "ECONOMY") {
    const { data } = await admin.from("country_economies").select("gdp,base_production_capacity,national_income,unemployment_rate").eq("country_key", target).maybeSingle<Record<string, unknown>>();
    return Object.fromEntries(Object.entries(data ?? {}).map(([name, value]) => [name, typeof value === "number" ? estimateRange(value, confidence) : "미설정"]));
  }
  if (domain === "MILITARY") {
    const stats = await loadCalculatedNationalStats(admin, target, worldTurn(worldDate), {}, worldDate);
    return { available_manpower: stats ? estimateRange(stats.availableManpower, confidence) : "미설정", classification: "군사 동원력 추정" };
  }
  if (domain === "RESEARCH") {
    const { data } = await admin.from("country_economies").select("research_capacity,research_points").eq("country_key", target).maybeSingle<Record<string, unknown>>();
    return Object.fromEntries(Object.entries(data ?? {}).map(([name, value]) => [name, typeof value === "number" ? estimateRange(value, confidence) : "미설정"]));
  }
  if (domain === "ADMINISTRATION_POLITICS") {
    const stats = await loadCalculatedNationalStats(admin, target, worldTurn(worldDate), {}, worldDate);
    if (!stats) return { stability: "미설정", war_support: "미설정", political_power: "미설정" };
    return {
      stability: estimateRange(stats.stability, confidence),
      war_support: estimateRange(stats.warSupport, confidence),
      political_power: estimateRange(stats.politicalPower, confidence),
    };
  }
  return { classification: "지하조직 활동 추정", activity: confidence === "VERY_LOW" ? "판단 불가" : confidence === "LOW" ? "미약" : "접촉망 존재" };
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "POST") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv(); if (!env) { response.status(503).json({ error: "INTELLIGENCE_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env); const actor = await requireDiplomacyActor(request, response, admin); if (!actor) return;
  const body = bodyOf(request); const action = typeof body.action === "string" ? body.action : "";
  try {
    const worldDate = await currentWorldDate(admin); const target = country(body.targetCountryKey);
    if (action === "ESTABLISH_NETWORK") {
      if (!target || target === actor.countryKey) throw new Error("INVALID_TARGET");
      const result = await admin.from("spy_networks").upsert({ observer_country_id: actor.countryKey, target_country_id: target, updated_world_date: worldDate }, { onConflict: "observer_country_id,target_country_id", ignoreDuplicates: true }).select("id").maybeSingle();
      if (result.error) throw result.error; response.status(200).json({ ok: true, id: result.data?.id }); return;
    }
    if (action === "START_UPGRADE") {
      const upgradeKey = key(body.upgradeKey); if (!upgradeKey) throw new Error("INVALID_UPGRADE");
      const [definition, existing] = await Promise.all([
        admin.from("intelligence_upgrade_definitions").select("*").eq("key", upgradeKey).eq("publish_status", "PUBLISHED").maybeSingle<Record<string, unknown>>(),
        admin.from("country_intelligence_upgrades").select("status").eq("country_id", actor.countryKey).eq("upgrade_key", upgradeKey).maybeSingle(),
      ]);
      if (definition.error || !definition.data) throw new Error("UPGRADE_NOT_FOUND"); if (existing.data) throw new Error("UPGRADE_ALREADY_OWNED");
      const cost = Number(definition.data.political_power_cost); await chargePoliticalPower(admin, actor.countryKey, cost);
      const result = await admin.from("country_intelligence_upgrades").insert({ country_id: actor.countryKey, upgrade_key: upgradeKey, status: "BUILDING", started_world_date: worldDate, complete_world_date: datePlus(worldDate, Number(definition.data.duration_world_days)) }).select("upgrade_key").single();
      if (result.error) throw result.error; response.status(200).json({ ok: true, id: result.data.upgrade_key }); return;
    }
    if (action === "COLLECT_INFORMATION") {
      const domain = typeof body.domain === "string" && DOMAINS.has(body.domain) ? body.domain : null; if (!target || !domain) throw new Error("INVALID_COLLECTION");
      const networkResult = await admin.from("spy_networks").select("*").eq("observer_country_id", actor.countryKey).eq("target_country_id", target).maybeSingle<Record<string, unknown>>();
      if (!networkResult.data) throw new Error("NETWORK_REQUIRED"); const infiltration = Number(networkResult.data[INFILTRATION_COLUMNS[domain]] ?? 0); if (infiltration < 5) throw new Error("INFILTRATION_TOO_LOW");
      await chargePoliticalPower(admin, actor.countryKey, 10); const confidence = confidenceForInfiltration(infiltration); const payload = await snapshotPayload(admin, target, domain, confidence, worldDate);
      const inserted = await admin.from("intelligence_snapshots").insert({ observer_country_id: actor.countryKey, target_country_id: target, domain, acquired_world_date: worldDate, confidence, expires_world_date: datePlus(worldDate, 30), payload }).select("id").single();
      if (inserted.error) throw inserted.error; response.status(200).json({ ok: true, id: inserted.data.id }); return;
    }
    if (action === "DEVELOP_NETWORK") {
      const domain = typeof body.domain === "string" && DOMAINS.has(body.domain) ? body.domain : null; if (!target || !domain) throw new Error("INVALID_NETWORK_DEVELOPMENT");
      const current = await admin.from("spy_networks").select("*").eq("observer_country_id", actor.countryKey).eq("target_country_id", target).maybeSingle<Record<string, unknown>>(); if (!current.data) throw new Error("NETWORK_REQUIRED");
      const column = INFILTRATION_COLUMNS[domain]; const previous = Number(current.data[column] ?? 0); if (previous >= 100) throw new Error("INFILTRATION_MAXIMUM"); await chargePoliticalPower(admin, actor.countryKey, 15);
      const next = Math.min(100, previous + 5); const update = await admin.from("spy_networks").update({ [column]: next, alertness: Math.min(100, Number(current.data.alertness ?? 0) + 1), updated_world_date: worldDate }).eq("id", current.data.id); if (update.error) throw update.error;
      if (Math.floor(next / 25) > Math.floor(previous / 25)) await admin.from("spy_assets").insert({ observer_country_id: actor.countryKey, target_country_id: target, domain, quality: Math.min(100, 25 + next / 2), created_world_date: worldDate });
      await admin.from("spy_audit_logs").insert({ actor: actor.userId ?? "development", actor_kind: "PLAYER", world_date: worldDate, before_state: { [column]: previous }, after_state: { [column]: next }, reason: "첩보망 침투 확대", source_type: "PLAYER_NETWORK", source_id: String(current.data.id) }); response.status(200).json({ ok: true, id: String(current.data.id) }); return;
    }
    if (action === "START_OPERATION") {
      const operationKey = key(body.operationKey); if (!target || !operationKey) throw new Error("INVALID_OPERATION");
      const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.length <= 180 ? body.idempotencyKey : randomUUID();
      const [definition, network, agency, targetAgency, active, cooldown, upgrades, repetitions] = await Promise.all([
        admin.from("spy_operation_definitions").select("*").eq("key", operationKey).eq("publish_status", "PUBLISHED").maybeSingle<Record<string, unknown>>(),
        admin.from("spy_networks").select("*").eq("observer_country_id", actor.countryKey).eq("target_country_id", target).maybeSingle<Record<string, unknown>>(),
        admin.from("intelligence_agencies").select("operation_slot_cap,capability").eq("country_id", actor.countryKey).maybeSingle<{ operation_slot_cap: number | null; capability: number | null }>(),
        admin.from("intelligence_agencies").select("counterintelligence").eq("country_id", target).maybeSingle<{ counterintelligence: number | null }>(),
        admin.from("spy_operations").select("id").eq("observer_country_id", actor.countryKey).in("state", ["ACTIVE", "PENDING_ADMIN_REVIEW"]),
        admin.from("spy_operation_cooldowns").select("available_world_date,recent_count").eq("observer_country_id", actor.countryKey).eq("target_country_id", target).eq("definition_key", operationKey).maybeSingle<{ available_world_date: string; recent_count: number }>(),
        admin.from("country_intelligence_upgrades").select("upgrade_key", { count: "exact", head: true }).eq("country_id", actor.countryKey).eq("status", "ACTIVE"),
        admin.from("spy_operations").select("id", { count: "exact", head: true }).eq("observer_country_id", actor.countryKey).eq("target_country_id", target).eq("definition_key", operationKey).gte("started_world_date", datePlus(worldDate, -90)),
      ]);
      if (!definition.data || !network.data) throw new Error("OPERATION_REQUIREMENTS_UNMET");
      if ((active.data?.length ?? 0) >= Number(agency.data?.operation_slot_cap ?? 0)) throw new Error("NO_OPERATION_SLOT");
      if (cooldown.data && cooldown.data.available_world_date > worldDate) throw new Error("OPERATION_COOLDOWN");
      const requirements = definition.data.requirements as { domain?: string; infiltration?: number; assets?: number }; const domain = requirements.domain ?? "UNDERGROUND";
      if (Number(network.data[INFILTRATION_COLUMNS[domain]] ?? 0) < Number(requirements.infiltration ?? 0)) throw new Error("INFILTRATION_TOO_LOW");
      const assets = await admin.from("spy_assets").select("id").eq("observer_country_id", actor.countryKey).eq("target_country_id", target).eq("domain", domain).eq("status", "ACTIVE").limit(Number(requirements.assets ?? 0));
      if ((assets.data?.length ?? 0) < Number(requirements.assets ?? 0)) throw new Error("ASSETS_REQUIRED");
      await chargePoliticalPower(admin, actor.countryKey, Number(definition.data.political_power_cost));
      const scores = operationScores({ baseDifficulty: Number(definition.data.base_difficulty), baseDetectionRisk: Number(definition.data.base_detection_risk), agency: Number(agency.data?.capability ?? 0), infiltration: Number(network.data[INFILTRATION_COLUMNS[domain]] ?? 0), assetQuality: assets.data?.length ? 50 : 0, upgrades: Number(upgrades.count ?? 0) * 2, counterintelligence: Number(targetAgency.data?.counterintelligence ?? 0), alertness: Number(network.data.alertness ?? 0), repetitions: Number(repetitions.count ?? 0), cover: 0 });
      const inserted = await admin.from("spy_operations").insert({ definition_key: operationKey, observer_country_id: actor.countryKey, target_country_id: target, state: "ACTIVE", current_phase: "PREPARATION", started_world_date: worldDate, phase_end_world_date: datePlus(worldDate, Number(definition.data.preparation_days)), admin_review_status: definition.data.admin_review_mode === "REQUIRED" ? "PENDING" : "NOT_REQUIRED", operation_idempotency_key: idempotencyKey, result_explanation: { scores, factors: { agency: agency.data?.capability, infiltration: network.data[INFILTRATION_COLUMNS[domain]], counterintelligence: targetAgency.data?.counterintelligence, alertness: network.data.alertness, upgrades: upgrades.count, repetitions: repetitions.count } } }).select("id").single();
      if (inserted.error) throw inserted.error;
      if (assets.data?.length) { await admin.from("spy_operation_assets").insert(assets.data.map((asset) => ({ operation_id: inserted.data.id, asset_id: asset.id }))); await admin.from("spy_assets").update({ status: "LOCKED" }).in("id", assets.data.map((asset) => asset.id)); }
      await Promise.all([
        admin.from("spy_operation_cooldowns").upsert({ observer_country_id: actor.countryKey, target_country_id: target, definition_key: operationKey, available_world_date: datePlus(worldDate, Number(definition.data.cooldown_days)), recent_count: Number(cooldown.data?.recent_count ?? 0) + 1 }),
        admin.from("spy_networks").update({ alertness: Math.min(100, Number(network.data.alertness ?? 0) + 8), updated_world_date: worldDate }).eq("id", network.data.id),
      ]);
      await admin.from("spy_audit_logs").insert({ operation_id: inserted.data.id, actor: actor.userId ?? "development", actor_kind: "PLAYER", world_date: worldDate, after_state: { phase: "PREPARATION", target }, reason: "플레이어 작전 개시", source_type: "PLAYER_ACTION", source_id: idempotencyKey });
      response.status(200).json({ ok: true, id: inserted.data.id }); return;
    }
    response.status(400).json({ error: "UNKNOWN_INTELLIGENCE_ACTION" });
  } catch (error) { const message = error instanceof Error ? error.message : "INTELLIGENCE_ACTION_FAILED"; console.error("intelligence action failed", error); response.status(message.includes("NOT_FOUND") ? 404 : message.includes("UNAVAILABLE") ? 503 : 409).json({ error: message.slice(0, 120) }); }
}
