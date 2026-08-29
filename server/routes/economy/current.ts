import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { economyWorldDate, requireEconomyActor } from "../../economy.js";
import { mergeStartingResources } from "../../startingResources.js";
import { mergeStartingEconomy, startingCapacityForEconomy } from "../../startingEconomies.js";
import { currentNumber, startingCountryStatsForCountry } from "../../startingCountryStats.js";

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
    const [economy, readiness, resources, capacity, history, rules, decisionState, militaryResources] = await Promise.all([
      admin.from("country_economies").select("*").eq("country_key", actor.countryKey).maybeSingle<EconomyRow>(),
      admin.rpc("tlr_economy_readiness", { p_country: actor.countryKey }),
      admin.from("country_resources").select("*").eq("country_key", actor.countryKey).order("resource_type_id").returns<ResourceRow[]>(),
      admin.rpc("tlr_trade_capacity_components", { p_country: actor.countryKey }),
      admin.from("economy_history").select("*").eq("country_key", actor.countryKey).order("period_end", { ascending: false }).limit(24).returns<HistoryRow[]>(),
      admin.from("economy_rules").select("settlement_interval_days,budget_min,budget_max,budget_step,calculation_parameters").eq("singleton", true).single(),
      admin.from("country_decision_states").select("political_power,political_power_gain_modifier,stability,war_support").eq("country_key", actor.countryKey).maybeSingle(),
      admin.from("country_military_resources").select("available_manpower,reserved_manpower").eq("country_key", actor.countryKey).maybeSingle(),
    ]);
    const failed = [economy, readiness, resources, capacity, history, rules, decisionState, militaryResources].find((result) => result.error);
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
    const mergedEconomy = mergeStartingEconomy(actor.countryKey, economy.data ?? null);
    const startingStats = startingCountryStatsForCountry(actor.countryKey);
    const politicalPowerGainModifier = currentNumber(decisionState.data?.political_power_gain_modifier, 0);
    const nationalStats = startingStats
      ? {
          basePoliticalPower: startingStats.base_political_power,
          politicalPower: currentNumber(decisionState.data?.political_power, startingStats.base_political_power),
          basePoliticalPowerPerTurn: startingStats.political_power_per_turn,
          politicalPowerPerTurn: startingStats.political_power_per_turn * (1 + politicalPowerGainModifier / 100),
          politicalPowerGainModifier,
          baseStability: startingStats.base_stability,
          stability: currentNumber(decisionState.data?.stability, startingStats.base_stability),
          baseWarSupport: startingStats.base_war_support,
          warSupport: currentNumber(decisionState.data?.war_support, startingStats.base_war_support),
          baseAvailableManpower: startingStats.base_available_manpower,
          availableManpower: currentNumber(militaryResources.data?.available_manpower, startingStats.base_available_manpower),
          reservedManpower: currentNumber(militaryResources.data?.reserved_manpower, 0),
        }
      : null;
    const databaseCapacity = Array.isArray(capacity.data) ? capacity.data[0] ?? null : capacity.data ?? null;
    const configuredDatabaseCapacity = databaseCapacity
      && typeof databaseCapacity === "object"
      && "effective_capacity" in databaseCapacity
      && Number(databaseCapacity.effective_capacity) > 0
      ? databaseCapacity
      : null;
    response.status(200).json({
      countryKey: actor.countryKey,
      worldDate,
      readiness: mergedEconomy ? "READY" : readiness.data ?? "UNCONFIGURED",
      economy: mergedEconomy,
      nationalStats,
      productionCapacity: configuredDatabaseCapacity ?? startingCapacityForEconomy(mergedEconomy),
      resources: resourceComponents,
      history: history.data ?? [],
      rules: rules.data,
    });
  } catch (error) {
    console.error("economy current failed", error);
    response.status(503).json({ error: "ECONOMY_DATA_UNAVAILABLE" });
  }
}
