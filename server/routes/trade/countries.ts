import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { cleanCountryKey, reviewRouteForCountry } from "../../diplomacy.js";
import { economyWorldDate, requireEconomyActor } from "../../economy.js";
import mapCountries from "../../../src/data/mapCountries.json" with { type: "json" };

type EconomyRow = {
  country_key: string;
  gdp: number | null;
  nominal_growth_rate: number | null;
  inflation_rate: number | null;
  unemployment_rate: number | null;
  national_debt: number | null;
  foreign_reserves: number | null;
  national_income: number | null;
  total_expenditure: number | null;
  base_production_capacity: number | null;
  domestic_capacity_used: number | null;
  nominal_tax_rate: number | null;
  tax_collection_efficiency: number | null;
  current_budget: Record<string, number> | null;
  updated_at: string;
};

type ResourceRow = {
  country_key: string;
  resource_type_id: string;
  stockpile: number | null;
  production_per_period: number | null;
  domestic_use: number | null;
  export_limit: number | null;
  is_public: boolean;
};

const requiredEconomyFields: Array<keyof EconomyRow> = [
  "gdp", "nominal_growth_rate", "inflation_rate", "unemployment_rate", "national_debt",
  "foreign_reserves", "national_income", "total_expenditure", "base_production_capacity",
  "domestic_capacity_used", "nominal_tax_rate", "tax_collection_efficiency", "current_budget",
];

const requiredBudgetFields = ["administration", "defense", "industry", "welfare", "education"] as const;

function hasCompleteBudget(value: EconomyRow["current_budget"]): boolean {
  return value !== null && requiredBudgetFields.every((field) => typeof value[field] === "number" && Number.isFinite(value[field]));
}

function readiness(row: EconomyRow | undefined): "UNCONFIGURED" | "PARTIAL" | "READY" {
  if (!row) return "UNCONFIGURED";
  const values = requiredEconomyFields.map((field) => row[field]);
  if (values.every((value) => value == null)) return "UNCONFIGURED";
  return values.every((value) => value != null) && hasCompleteBudget(row.current_budget) ? "READY" : "PARTIAL";
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "ECONOMY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireEconomyActor(request, response, admin);
  if (!actor) return;
  try {
    const worldDate = await economyWorldDate(admin);
    const rawTarget = Array.isArray(request.query?.targetCountryKey) ? request.query?.targetCountryKey[0] : request.query?.targetCountryKey;
    const target = rawTarget ? cleanCountryKey(rawTarget) : null;
    if (rawTarget && (!target || target === actor.countryKey)) { response.status(400).json({ error: "INVALID_TARGET_COUNTRY" }); return; }

    const allKeys = (mapCountries as Array<{ key: string }>).map(({ key }) => key).filter((key) => key !== actor.countryKey && (!target || key === target));
    const [{ data: economies, error: economyError }, { data: resources, error: resourceError }] = await Promise.all([
      admin.from("country_economies").select("country_key,gdp,nominal_growth_rate,inflation_rate,unemployment_rate,national_debt,foreign_reserves,national_income,total_expenditure,base_production_capacity,domestic_capacity_used,nominal_tax_rate,tax_collection_efficiency,current_budget,updated_at").in("country_key", allKeys).returns<EconomyRow[]>(),
      admin.from("country_resources").select("country_key,resource_type_id,stockpile,production_per_period,domestic_use,export_limit,is_public").in("country_key", allKeys).eq("is_public", true).returns<ResourceRow[]>(),
    ]);
    if (economyError) throw economyError;
    if (resourceError) throw resourceError;

    // Supabase's isolated Vercel function build can infer `unknown` here even
    // with `.returns<T>()`; validate at the query boundary and retain the
    // concrete row types throughout the response mapping.
    const economyRows = (economies ?? []) as unknown as EconomyRow[];
    const resourceData = (resources ?? []) as unknown as ResourceRow[];
    const economyByCountry = new Map<string, EconomyRow>(economyRows.map((row) => [row.country_key, row]));
    const rows = await Promise.all(allKeys.map(async (countryKey) => {
      const economy = economyByCountry.get(countryKey);
      const state = readiness(economy);
      const publicResources = resourceData.filter((row) => row.country_key === countryKey);
      const resourceRows = await Promise.all(publicResources.map(async (resource) => {
        const result = await admin.rpc("tlr_trade_resource_components", { p_country: countryKey, p_resource: resource.resource_type_id });
        const component = Array.isArray(result.data) ? result.data[0] : result.data;
        return { ...resource, available: component && typeof component === "object" && "available" in component ? Number(component.available) : null };
      }));
      const capacityResult = state === "UNCONFIGURED" ? { data: null } : await admin.rpc("tlr_trade_capacity_components", { p_country: countryKey });
      return {
        countryKey,
        readiness: state,
        reviewRoute: await reviewRouteForCountry(admin, countryKey),
        productionCapacity: capacityResult.data,
        resources: resourceRows,
        updatedAt: economy?.updated_at ?? null,
      };
    }));
    response.status(200).json({ actorCountryKey: actor.countryKey, worldDate, countries: rows });
  } catch (error) {
    console.error("trade country list failed", error);
    response.status(503).json({ error: "TRADE_DATA_UNAVAILABLE" });
  }
}
