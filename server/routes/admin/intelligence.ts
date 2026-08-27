import { getAdminClient, getServerEnv } from "../../auth.js";
import { requireAdminSession } from "../../adminAuth.js";
import { currentWorldDate } from "../../diplomacy.js";
import type { ApiRequest, ApiResponse } from "../../types.js";

const SUCCESS = new Set(["SUCCESS", "FAILURE"]); const DETECTION = new Set(["DETECTED", "UNDETECTED"]); const ATTRIBUTION = new Set(["UNATTRIBUTED", "SUSPECTED", "ATTRIBUTED"]);
const DOMAINS = new Set(["ECONOMY", "ADMINISTRATION_POLITICS", "RESEARCH", "MILITARY", "UNDERGROUND"]);
function bodyOf(request: ApiRequest): Record<string, unknown> { return request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {}; }
function textValue(value: unknown, max = 1000): string | null { return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null; }
function numberValue(value: unknown, min: number, max: number): number | null { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null; }
export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const session = requireAdminSession(request, response); if (!session) return; const env = getServerEnv(); if (!env) { response.status(503).json({ error: "INTELLIGENCE_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  try {
    const worldDate = await currentWorldDate(admin);
    if (request.method === "GET") {
      const [agencies, upgradeDefinitions, upgrades, operationDefinitions, networks, assets, operations, snapshots, eventCandidates, auditLogs] = await Promise.all([
        admin.from("intelligence_agencies").select("*").order("country_id"), admin.from("intelligence_upgrade_definitions").select("*").order("sort_order"), admin.from("country_intelligence_upgrades").select("*").order("started_world_date", { ascending: false }),
        admin.from("spy_operation_definitions").select("*").order("sort_order"), admin.from("spy_networks").select("*").order("updated_world_date", { ascending: false }), admin.from("spy_assets").select("*").order("created_world_date", { ascending: false }),
        admin.from("spy_operations").select("*").order("created_at", { ascending: false }).limit(250), admin.from("intelligence_snapshots").select("*").order("acquired_world_date", { ascending: false }).limit(250), admin.from("spy_event_candidates").select("*").order("created_at", { ascending: false }).limit(200), admin.from("spy_audit_logs").select("*").order("real_timestamp", { ascending: false }).limit(250),
      ]); const failed = [agencies, upgradeDefinitions, upgrades, operationDefinitions, networks, assets, operations, snapshots, eventCandidates, auditLogs].find((result) => result.error); if (failed?.error) throw failed.error;
      response.status(200).json({ worldDate, actorCountryKey: "ADMIN", agency: null, agencies: agencies.data ?? [], upgradeDefinitions: upgradeDefinitions.data ?? [], upgrades: upgrades.data ?? [], operationDefinitions: operationDefinitions.data ?? [], networks: networks.data ?? [], assets: assets.data ?? [], operations: operations.data ?? [], snapshots: snapshots.data ?? [], eventCandidates: eventCandidates.data ?? [], auditLogs: auditLogs.data ?? [] }); return;
    }
    if (request.method !== "POST") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
    const body = bodyOf(request); const action = textValue(body.action, 80); const reason = textValue(body.reason, 1000);
    if (!action || !reason) { response.status(400).json({ error: "REASON_REQUIRED" }); return; }
    if (action === "RESOLVE_OPERATION") {
      const operationId = textValue(body.operationId, 80); const success = textValue(body.success, 30); const detection = textValue(body.detection, 30); const attribution = textValue(body.attribution, 30);
      if (!operationId || !success || !detection || !attribution || !SUCCESS.has(success) || !DETECTION.has(detection) || !ATTRIBUTION.has(attribution)) { response.status(400).json({ error: "INVALID_OPERATION_RESULT" }); return; }
      const before = await admin.from("spy_operations").select("*").eq("id", operationId).maybeSingle(); if (before.error || !before.data) { response.status(404).json({ error: "OPERATION_NOT_FOUND" }); return; }
      const after = { success_result: success, detection_result: detection, attribution_result: detection === "UNDETECTED" ? "UNATTRIBUTED" : attribution, state: success === "SUCCESS" ? "COMPLETED" : "FAILED", current_phase: "RESULT", admin_review_status: "APPROVED", updated_at: new Date().toISOString() };
      const result = await admin.from("spy_operations").update(after).eq("id", operationId); if (result.error) throw result.error;
      await admin.from("spy_audit_logs").insert({ operation_id: operationId, actor: session.sub, actor_kind: session.kind, world_date: worldDate, before_state: before.data, after_state: after, reason, source_type: "ADMIN_OVERRIDE", source_id: operationId }); response.status(200).json({ ok: true }); return;
    }
    if (action === "ADJUST_NETWORK") {
      const networkId = textValue(body.networkId, 80); const field = textValue(body.field, 80); const value = numberValue(body.value, 0, 100); const allowed = new Set(["economy_infiltration","administration_politics_infiltration","research_infiltration","military_infiltration","underground_infiltration","alertness"]);
      if (!networkId || !field || value === null || !allowed.has(field)) { response.status(400).json({ error: "INVALID_NETWORK_ADJUSTMENT" }); return; }
      const before = await admin.from("spy_networks").select("*").eq("id", networkId).maybeSingle(); if (!before.data) { response.status(404).json({ error: "NETWORK_NOT_FOUND" }); return; }
      const after = { [field]: value, updated_world_date: worldDate, version: Number((before.data as { version?: number }).version ?? 1) + 1 }; const update = await admin.from("spy_networks").update(after).eq("id", networkId); if (update.error) throw update.error;
      await admin.from("spy_audit_logs").insert({ actor: session.sub, actor_kind: session.kind, world_date: worldDate, before_state: before.data, after_state: after, reason, source_type: "ADMIN_NETWORK", source_id: networkId }); response.status(200).json({ ok: true }); return;
    }
    if (action === "GRANT_ASSET") {
      const observer = textValue(body.observerCountryId, 40); const target = textValue(body.targetCountryId, 40); const domain = textValue(body.domain, 40); const quality = numberValue(body.quality, 0, 100);
      if (!observer || !target || !domain || quality === null || !DOMAINS.has(domain)) { response.status(400).json({ error: "INVALID_ASSET" }); return; }
      const inserted = await admin.from("spy_assets").insert({ observer_country_id: observer, target_country_id: target, domain, quality, created_world_date: worldDate }).select("id").single(); if (inserted.error) throw inserted.error;
      await admin.from("spy_audit_logs").insert({ actor: session.sub, actor_kind: session.kind, world_date: worldDate, after_state: { observer, target, domain, quality }, reason, source_type: "ADMIN_ASSET", source_id: inserted.data.id }); response.status(200).json({ ok: true, id: inserted.data.id }); return;
    }
    if (action === "RETRACT_SNAPSHOT") { const snapshotId = textValue(body.snapshotId, 80); if (!snapshotId) throw new Error("INVALID_SNAPSHOT"); const update = await admin.from("intelligence_snapshots").update({ status: "RETRACTED" }).eq("id", snapshotId); if (update.error) throw update.error; await admin.from("spy_audit_logs").insert({ actor: session.sub, actor_kind: session.kind, world_date: worldDate, after_state: { status: "RETRACTED" }, reason, source_type: "ADMIN_SNAPSHOT", source_id: snapshotId }); response.status(200).json({ ok: true }); return; }
    if (action === "UPSERT_OPERATION_DEFINITION") {
      const key = textValue(body.key, 80); const displayName = textValue(body.displayName, 120); const description = textValue(body.description, 3000) ?? ""; const domain = textValue(body.domain, 40); const cost = numberValue(body.cost, 0, 10000); const duration = numberValue(body.preparationDays, 1, 3650); const infiltration = numberValue(body.infiltration, 0, 100); const assets = numberValue(body.assets, 0, 20);
      if (!key || !/^[a-z0-9][a-z0-9_]*$/u.test(key) || !displayName || !domain || !DOMAINS.has(domain) || cost === null || duration === null || infiltration === null || assets === null) { response.status(400).json({ error: "INVALID_DEFINITION" }); return; }
      const row = { key, display_name: displayName, description, icon_asset_key: textValue(body.iconAssetKey, 240) ?? "intelligence/operation", operation_class: "MAJOR", requirements: { domain, infiltration, assets }, political_power_cost: cost, preparation_days: duration, execution_days: Math.max(1, Math.round(duration * .55)), extraction_days: Math.max(1, Math.round(duration * .35)), base_difficulty: numberValue(body.baseDifficulty, 0, 100) ?? 50, base_detection_risk: numberValue(body.detectionRisk, 0, 100) ?? 35, admin_review_mode: "REQUIRED", cooldown_days: numberValue(body.cooldownDays, 0, 3650) ?? 14, result_hooks: { eventCandidate: true }, publish_status: body.publish === true ? "PUBLISHED" : "DRAFT", updated_at: new Date().toISOString() };
      const upsert = await admin.from("spy_operation_definitions").upsert(row).select("key").single(); if (upsert.error) throw upsert.error; await admin.from("spy_audit_logs").insert({ actor: session.sub, actor_kind: session.kind, world_date: worldDate, after_state: row, reason, source_type: "ADMIN_CONTENT", source_id: key }); response.status(200).json({ ok: true, id: key }); return;
    }
    if (action === "UPSERT_UPGRADE_DEFINITION") {
      const key = textValue(body.key, 80); const displayName = textValue(body.displayName, 120); const category = textValue(body.category, 40); const categories = new Set(["INFORMATION","COUNTERINTELLIGENCE","OPERATIONS","TRAINING","CRYPTOGRAPHY"]); const cost = numberValue(body.cost, 0, 10000); const duration = numberValue(body.durationDays, 1, 3650);
      if (!key || !/^[a-z0-9][a-z0-9_]*$/u.test(key) || !displayName || !category || !categories.has(category) || cost === null || duration === null) { response.status(400).json({ error: "INVALID_UPGRADE_DEFINITION" }); return; }
      const row = { key, category, display_name: displayName, description: textValue(body.description, 3000) ?? "", icon_asset_key: textValue(body.iconAssetKey, 240) ?? "intelligence/agency", political_power_cost: cost, duration_world_days: duration, requirements: body.requirements && typeof body.requirements === "object" ? body.requirements : {}, modifiers: body.modifiers && typeof body.modifiers === "object" ? body.modifiers : {}, publish_status: body.publish === true ? "PUBLISHED" : "DRAFT", updated_at: new Date().toISOString() };
      const upsert = await admin.from("intelligence_upgrade_definitions").upsert(row).select("key").single(); if (upsert.error) throw upsert.error; await admin.from("spy_audit_logs").insert({ actor: session.sub, actor_kind: session.kind, world_date: worldDate, after_state: row, reason, source_type: "ADMIN_CONTENT", source_id: key }); response.status(200).json({ ok: true, id: key }); return;
    }
    response.status(400).json({ error: "UNKNOWN_ADMIN_INTELLIGENCE_ACTION" });
  } catch (error) { console.error("admin intelligence failed", error); response.status(503).json({ error: "INTELLIGENCE_ADMIN_ACTION_FAILED" }); }
}
