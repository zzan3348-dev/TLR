import { getAdminClient, getServerEnv } from "../../auth.js";
import { currentWorldDate, requireDiplomacyActor } from "../../diplomacy.js";
import type { ApiRequest, ApiResponse } from "../../types.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv(); if (!env) { response.status(503).json({ error: "INTELLIGENCE_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env); const actor = await requireDiplomacyActor(request, response, admin); if (!actor) return;
  try {
    const worldDate = await currentWorldDate(admin);
    const [agency, upgrades, upgradeDefinitions, operationDefinitions, networks, assets, operations, snapshots, detectedIncidents] = await Promise.all([
      admin.from("intelligence_agencies").select("*").eq("country_id", actor.countryKey).maybeSingle(),
      admin.from("country_intelligence_upgrades").select("*").eq("country_id", actor.countryKey).order("started_world_date"),
      admin.from("intelligence_upgrade_definitions").select("*").eq("publish_status", "PUBLISHED").order("sort_order"),
      admin.from("spy_operation_definitions").select("*").eq("publish_status", "PUBLISHED").order("sort_order"),
      admin.from("spy_networks").select("*").eq("observer_country_id", actor.countryKey).order("target_country_id"),
      admin.from("spy_assets").select("*").eq("observer_country_id", actor.countryKey).order("created_world_date", { ascending: false }),
      admin.from("spy_operations").select("*").eq("observer_country_id", actor.countryKey).order("created_at", { ascending: false }).limit(120),
      admin.from("intelligence_snapshots").select("*").eq("observer_country_id", actor.countryKey).order("acquired_world_date", { ascending: false }).limit(160),
      admin.from("spy_operations").select("id,definition_key,observer_country_id,target_country_id,state,detection_result,attribution_result,started_world_date").eq("target_country_id", actor.countryKey).eq("detection_result", "DETECTED").order("started_world_date", { ascending: false }).limit(80),
    ]);
    const failed = [agency, upgrades, upgradeDefinitions, operationDefinitions, networks, assets, operations, snapshots, detectedIncidents].find((result) => result.error);
    if (failed?.error) throw failed.error;
    response.status(200).json({ worldDate, actorCountryKey: actor.countryKey, agency: agency.data, upgrades: upgrades.data ?? [], upgradeDefinitions: upgradeDefinitions.data ?? [], operationDefinitions: operationDefinitions.data ?? [], networks: networks.data ?? [], assets: assets.data ?? [], operations: operations.data ?? [], snapshots: snapshots.data ?? [], detectedIncidents: (detectedIncidents.data ?? []).map((incident) => ({ ...incident, observer_country_id: incident.attribution_result === "UNATTRIBUTED" ? null : incident.observer_country_id })) });
  } catch (error) { console.error("intelligence overview failed", error); response.status(503).json({ error: "INTELLIGENCE_DATA_UNAVAILABLE" }); }
}
