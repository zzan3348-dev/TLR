import type { AdminClient } from "./auth.js";
import { startingCountryStatsForCountry } from "./startingCountryStats.js";
import {
  calculateNationalStats,
  collectCountryStatModifiers,
  type DecisionModifierRow,
} from "./countryStatModifiers.js";

type DecisionStateRow = {
  political_power: number | null;
  political_power_gain_modifier: number | null;
  stability: number | null;
  war_support: number | null;
};

export async function loadCalculatedNationalStats(
  admin: AdminClient,
  countryKey: string,
  turn: number,
  lawChoices: Readonly<Record<string, string>> = {},
  worldDate?: string,
) {
  const starting = startingCountryStatsForCountry(countryKey);
  if (!starting) return null;
  let activeSpiritQuery = admin.from("country_active_national_spirits").select("spirit_id").eq("country_key", countryKey);
  if (worldDate) activeSpiritQuery = activeSpiritQuery.or(`expires_world_date.is.null,expires_world_date.gt.${worldDate}`);
  const [decisionState, decisionModifiers, activeSpirits, resources, landUnits, airWings, vessels, templates] = await Promise.all([
    admin.from("country_decision_states").select("political_power,political_power_gain_modifier,stability,war_support").eq("country_key", countryKey).maybeSingle<DecisionStateRow>(),
    admin.from("country_decision_modifiers").select("decision_id,effect_key,value,unit").eq("country_key", countryKey).gt("expires_turn", turn).returns<DecisionModifierRow[]>(),
    activeSpiritQuery.returns<Array<{ spirit_id: string }>>(),
    admin.from("country_military_resources").select("reserved_manpower").eq("country_key", countryKey).maybeSingle<{ reserved_manpower: number | null }>(),
    admin.from("military_land_units").select("current_manpower,status").eq("country_key", countryKey).neq("status", "DISBANDED").returns<Array<{ current_manpower: number | null; status: string }>>(),
    admin.from("military_air_wings").select("current_personnel,status").eq("country_key", countryKey).neq("status", "DISBANDED").returns<Array<{ current_personnel: number | null; status: string }>>(),
    admin.from("military_vessels").select("template_id,status").eq("country_key", countryKey).not("status", "in", "(QUEUED,SUNK,RETIRED)").returns<Array<{ template_id: string; status: string }>>(),
    admin.from("military_templates").select("id,crew_required").eq("force_kind", "VESSEL").returns<Array<{ id: string; crew_required: number | null }>>(),
  ]);
  const results = [decisionState, decisionModifiers, activeSpirits, resources, landUnits, airWings, vessels, templates];
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
  const crewByTemplate = new Map((templates.data ?? []).map((row) => [row.id, Number(row.crew_required ?? 0)]));
  const activeMilitaryManpower =
    (landUnits.data ?? []).reduce((sum, row) => sum + Number(row.current_manpower ?? 0), 0)
    + (airWings.data ?? []).reduce((sum, row) => sum + Number(row.current_personnel ?? 0), 0)
    + (vessels.data ?? []).reduce((sum, row) => sum + (crewByTemplate.get(row.template_id) ?? 0), 0);
  const modifiers = collectCountryStatModifiers(
    countryKey,
    lawChoices,
    (activeSpirits.data ?? []).map((row) => row.spirit_id),
    decisionModifiers.data ?? [],
  );
  return calculateNationalStats({
    basePoliticalPower: starting.base_political_power,
    basePoliticalPowerPerTurn: starting.political_power_per_turn,
    storedPoliticalPower: decisionState.data?.political_power,
    storedPoliticalPowerGainModifier: decisionState.data?.political_power_gain_modifier,
    baseStability: starting.base_stability,
    storedStability: decisionState.data?.stability,
    baseWarSupport: starting.base_war_support,
    storedWarSupport: decisionState.data?.war_support,
    baseAvailableManpower: starting.base_available_manpower,
    activeMilitaryManpower,
    reservedManpower: Number(resources.data?.reserved_manpower ?? 0),
    modifiers,
  });
}
