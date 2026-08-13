import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { economyWorldDate, requireEconomyActor } from "../../economy.js";
import { mergeStartingResources } from "../../startingResources.js";

type EconomyRow = Record<string, unknown> & { country_key: string };
type ResourceRow = Record<string, unknown> & { resource_type_id: string };
type HistoryRow = Record<string, unknown>;

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "ECONOMY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireEconomyActor(request, response, admin);
  if (!actor) return;
  try {
    const worldDate = await economyWorldDate(admin);
    const [economy, readiness, resources, capacity, history, rules] = await Promise.all([
      admin.from("country_economies").select("*").eq("country_key", actor.countryKey).maybeSingle<EconomyRow>(),
      admin.rpc("tlr_economy_readiness", { p_country: actor.countryKey }),
      admin.from("country_resources").select("*").eq("country_key", actor.countryKey).order("resource_type_id").returns<ResourceRow[]>(),
      admin.rpc("tlr_trade_capacity_components", { p_country: actor.countryKey }),
      admin.from("economy_history").select("*").eq("country_key", actor.countryKey).order("period_end", { ascending: false }).limit(24).returns<HistoryRow[]>(),
      admin.from("economy_rules").select("settlement_interval_days,budget_min,budget_max,budget_step,calculation_parameters").eq("singleton", true).single(),
    ]);
    const failed = [economy, readiness, resources, capacity, history, rules].find((result) => result.error);
    if (failed?.error) throw failed.error;
    const databaseResources = (resources.data ?? []) as Array<ResourceRow & { country_key: string; export_limit?: number; production_per_period?: number; domestic_use?: number }>;
    const mergedResources = mergeStartingResources(actor.countryKey, databaseResources);
    const resourceComponents = await Promise.all(mergedResources.map(async (resource) => {
      if ("available" in resource && typeof resource.available === "number") return resource;
      const result = await admin.rpc("tlr_trade_resource_components", { p_country: actor.countryKey, p_resource: resource.resource_type_id });
      if (result.error) throw result.error;
      const component = Array.isArray(result.data) ? result.data[0] : result.data;
      return { ...resource, available: component && typeof component === "object" && "available" in component ? Number(component.available) : null };
    }));
    response.status(200).json({
      countryKey: actor.countryKey,
      worldDate,
      readiness: readiness.data ?? "UNCONFIGURED",
      economy: economy.data ?? null,
      productionCapacity: Array.isArray(capacity.data) ? capacity.data[0] ?? null : capacity.data ?? null,
      resources: resourceComponents,
      history: history.data ?? [],
      rules: rules.data,
    });
  } catch (error) {
    console.error("economy current failed", error);
    response.status(503).json({ error: "ECONOMY_DATA_UNAVAILABLE" });
  }
}
