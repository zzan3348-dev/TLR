import rawCountryParties from "../src/data/countryParties.json" with { type: "json" };
import {
  COMMON_DECISIONS,
  type CommonDecisionDefinition,
  type DecisionOverview,
  type DecisionPartyOption,
  type DecisionView,
} from "../src/features/decisions/data/commonDecisions.js";
import type { AdminClient } from "./auth.js";
import { currentWorldDate } from "./diplomacy.js";
import { mergeStartingEconomy } from "./startingEconomies.js";
import { currentNumber, startingCountryStatsForCountry } from "./startingCountryStats.js";
import { loadCalculatedNationalStats } from "./countryNationalStats.js";
import { currentTurnNumber } from "./worldProgression.js";

type DecisionStateRow = {
  country_key: string;
  political_power: number | null;
  political_power_gain_modifier: number;
  stability: number | null;
  war_support: number | null;
  poverty_rate: number | null;
  living_standard_stage: number | null;
  living_standard_max_stage: number | null;
};

type EconomyRow = {
  unemployment_rate: number | null;
  budget_fulfillment_rate: number | null;
  nominal_growth_rate: number | null;
  national_income: number | null;
  tax_collection_efficiency: number | null;
  research_capacity: number | null;
  production_capacity_modifier: number | null;
};

type ModifierRow = {
  decision_id: string;
  effect_key: string;
  value: number;
  unit: string;
  expires_turn: number;
};

type ExecutionRow = {
  decision_id: string;
  started_turn: number;
  cooldown_until_turn: number;
  temporary_until_turn: number | null;
};
type PartyOverrideRow = { party_id: string; support: number };

type PartySource = {
  rulingParty?: string;
  parties?: Array<{
    id: string;
    name: string;
    ideologyCategory: string;
    subIdeology: string;
    support: number;
  }>;
};

export type DecisionRuntimeState = {
  worldDate: string;
  turn: number;
  metrics: DecisionStateRow | null;
  economy: EconomyRow | null;
  manpower: number | null;
  atWar: boolean;
  parties: DecisionPartyOption[];
  modifiers: ModifierRow[];
  executions: ExecutionRow[];
};

const partyCatalog = rawCountryParties as Record<string, PartySource>;
function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function partyOptions(countryKey: string, overrides: PartyOverrideRow[]): DecisionPartyOption[] {
  const source = partyCatalog[countryKey];
  const overrideMap = new Map(overrides.map((row) => [row.party_id, numeric(row.support) ?? 0]));
  return (source?.parties ?? []).map((party) => ({
    id: party.id,
    name: party.name,
    subIdeology: party.subIdeology,
    ideologyCategory: party.ideologyCategory,
    support: overrideMap.get(party.id) ?? party.support,
    ruling: party.name === source?.rulingParty,
  }));
}

export async function loadDecisionRuntime(admin: AdminClient, countryKey: string): Promise<DecisionRuntimeState> {
  const worldDate = await currentWorldDate(admin);
  const turn = await currentTurnNumber(admin);
  const [metricsResult, economyResult, manpowerResult, partyResult, modifierResult, executionResult, warResult] = await Promise.all([
    admin.from("country_decision_states").select("*").eq("country_key", countryKey).maybeSingle<DecisionStateRow>(),
    admin.from("country_economies").select("unemployment_rate,budget_fulfillment_rate,nominal_growth_rate,national_income,tax_collection_efficiency,research_capacity,production_capacity_modifier").eq("country_key", countryKey).maybeSingle<EconomyRow>(),
    admin.from("country_military_resources").select("available_manpower").eq("country_key", countryKey).maybeSingle<{ available_manpower: number | null }>(),
    admin.from("country_decision_party_support").select("party_id,support").eq("country_key", countryKey).returns<PartyOverrideRow[]>(),
    admin.from("country_decision_modifiers").select("decision_id,effect_key,value,unit,expires_turn").eq("country_key", countryKey).gt("expires_turn", turn).returns<ModifierRow[]>(),
    admin.from("country_decision_executions").select("decision_id,started_turn,cooldown_until_turn,temporary_until_turn").eq("country_key", countryKey).gt("cooldown_until_turn", turn).order("started_turn", { ascending: false }).returns<ExecutionRow[]>(),
    admin.from("military_conflict_participants").select("conflict_id,military_conflicts!inner(status)").eq("country_key", countryKey).is("left_world_date", null).not("military_conflicts.status", "in", "(ENDED,CANCELLED)").limit(1),
  ]);
  const failed = [metricsResult, economyResult, manpowerResult, partyResult, modifierResult, executionResult, warResult].find((result) => result.error);
  if (failed?.error) throw failed.error;
  const calculatedStats = await loadCalculatedNationalStats(admin, countryKey, turn, {}, worldDate);
  const startingStats = startingCountryStatsForCountry(countryKey);
  const rawMetrics = metricsResult.data;
  const metrics = startingStats
    ? {
        country_key: countryKey,
        political_power: currentNumber(rawMetrics?.political_power, startingStats.base_political_power),
        political_power_gain_modifier: calculatedStats?.politicalPowerGainModifier ?? currentNumber(rawMetrics?.political_power_gain_modifier, 0),
        stability: calculatedStats?.stability ?? currentNumber(rawMetrics?.stability, startingStats.base_stability),
        war_support: calculatedStats?.warSupport ?? currentNumber(rawMetrics?.war_support, startingStats.base_war_support),
        poverty_rate: numeric(rawMetrics?.poverty_rate),
        living_standard_stage: numeric(rawMetrics?.living_standard_stage),
        living_standard_max_stage: numeric(rawMetrics?.living_standard_max_stage),
      }
    : rawMetrics ?? null;
  const mergedEconomy = mergeStartingEconomy(
    countryKey,
    economyResult.data ? { country_key: countryKey, ...economyResult.data } : null,
  ) as unknown as EconomyRow | null;
  return {
    worldDate,
    turn,
    metrics,
    economy: mergedEconomy,
    manpower: calculatedStats?.availableManpower ?? (startingStats
      ? currentNumber(manpowerResult.data?.available_manpower, startingStats.base_available_manpower)
      : numeric(manpowerResult.data?.available_manpower)),
    atWar: (warResult.data?.length ?? 0) > 0,
    parties: partyOptions(countryKey, partyResult.data ?? []),
    modifiers: modifierResult.data ?? [],
    executions: executionResult.data ?? [],
  };
}

function targetParty(state: DecisionRuntimeState, targetPartyId?: string): DecisionPartyOption | null {
  return state.parties.find((party) => party.id === targetPartyId) ?? null;
}

export function decisionUnmetConditions(
  definition: CommonDecisionDefinition,
  state: DecisionRuntimeState,
  targetPartyId?: string,
): string[] {
  const unmet: string[] = [];
  const pp = state.metrics?.political_power ?? null;
  if (pp === null) unmet.push("정치력 미설정");
  else if (pp < definition.politicalPowerCost) unmet.push(`정치력 ${definition.politicalPowerCost} 필요`);
  const stability = state.metrics?.stability ?? null;
  const warSupport = state.metrics?.war_support ?? null;
  const party = targetParty(state, targetPartyId);
  const cooldown = state.executions.find((row) => row.decision_id === definition.id);
  if (cooldown) unmet.push(`재사용 대기 ${cooldown.cooldown_until_turn - state.turn}턴`);
  if (state.modifiers.some((row) => row.decision_id === definition.id)) unmet.push("동일 결정의 효과가 적용 중");

  switch (definition.id) {
    case "ideology_repression":
      if (!party) unmet.push("탄압할 정당을 선택해야 함");
      else {
        if (party.ruling) unmet.push("집권 정당은 탄압할 수 없음");
        if (party.support < 5) unmet.push("대상 정당 지지도 5% 이상 필요");
      }
      if (stability === null) unmet.push("안정도 미설정");
      break;
    case "ideology_propaganda":
      if (!party) unmet.push("선전할 정당을 선택해야 함");
      break;
    case "crackdown_political_violence":
      if (stability === null) unmet.push("안정도 미설정");
      else if (stability > 60) unmet.push("안정도 60% 이하 필요");
      break;
    case "peace_propaganda":
      if (state.atWar) unmet.push("전쟁 중에는 실행 불가");
      if (stability === null) unmet.push("안정도 미설정");
      if (warSupport === null) unmet.push("전쟁 지지도 미설정");
      else if (warSupport < 30) unmet.push("전쟁 지지도 30% 이상 필요");
      break;
    case "improve_labor_conditions": {
      if (state.atWar) unmet.push("전쟁 중에는 실행 불가");
      const current = state.metrics?.living_standard_stage ?? null;
      const maximum = state.metrics?.living_standard_max_stage ?? null;
      if (stability === null) unmet.push("안정도 미설정");
      if (current === null || maximum === null) unmet.push("생활 수준 미설정");
      else if (current >= maximum) unmet.push("생활 수준이 이미 최고 단계");
      break;
    }
    case "austerity":
    case "special_tax":
      if (stability === null) unmet.push("안정도 미설정");
      if (!state.economy) unmet.push("경제 수치 미설정");
      break;
    case "public_works":
      if (state.economy?.unemployment_rate === null || state.economy?.unemployment_rate === undefined) unmet.push("실업률 미설정");
      else if (state.economy.unemployment_rate < 2) unmet.push("실업률 2% 이상 필요");
      break;
    case "emergency_relief":
      if (state.metrics?.poverty_rate === null || state.metrics?.poverty_rate === undefined) unmet.push("빈곤율 미설정");
      else if (state.metrics.poverty_rate < 10) unmet.push("빈곤율 10% 이상 필요");
      if (stability === null) unmet.push("안정도 미설정");
      break;
    case "corporate_tax_benefits":
    case "research_subsidies":
      if (!state.economy) unmet.push("경제 수치 미설정");
      break;
    case "war_propaganda":
      if (!state.atWar) unmet.push("전쟁 중에만 실행 가능");
      if (warSupport === null) unmet.push("전쟁 지지도 미설정");
      break;
    case "recruitment_campaign":
      if (warSupport === null && !state.atWar) unmet.push("전쟁 지지도 미설정");
      else if (!state.atWar && (warSupport ?? 0) < 60) unmet.push("전쟁 중 또는 전쟁 지지도 60% 이상 필요");
      if (stability === null) unmet.push("안정도 미설정");
      if (state.manpower === null) unmet.push("가용 인력 미설정");
      break;
    case "total_mobilization_propaganda":
      if (!state.atWar) unmet.push("전쟁 중에만 실행 가능");
      if (warSupport === null) unmet.push("전쟁 지지도 미설정");
      else if (warSupport < 50) unmet.push("전쟁 지지도 50% 이상 필요");
      if (stability === null) unmet.push("안정도 미설정");
      if (state.manpower === null) unmet.push("가용 인력 미설정");
      if (!state.economy) unmet.push("생산 능력 미설정");
      break;
  }
  return [...new Set(unmet)];
}

function isVisible(definition: CommonDecisionDefinition, state: DecisionRuntimeState): boolean {
  if (definition.visibilityCondition === "atWar") return state.atWar;
  if (definition.visibilityCondition === "hasParty") return state.parties.length > 0;
  if (definition.visibilityCondition === "hasNonRulingParty") return state.parties.some((party) => !party.ruling);
  return true;
}

export function decisionOverview(countryKey: string, state: DecisionRuntimeState, selectedTargets: Record<string, string | undefined> = {}): DecisionOverview {
  const decisions: DecisionView[] = COMMON_DECISIONS.map((definition) => {
    const unmetConditions = decisionUnmetConditions(definition, state, selectedTargets[definition.id]);
    const execution = state.executions.find((row) => row.decision_id === definition.id);
    const running = Boolean(execution?.temporary_until_turn && execution.temporary_until_turn > state.turn);
    const cooldownRemaining = Math.max(0, (execution?.cooldown_until_turn ?? state.turn) - state.turn);
    const progress = running && execution?.temporary_until_turn
      ? {
          startedTurn: execution.started_turn,
          endTurn: execution.temporary_until_turn,
          elapsedTurns: Math.max(0, state.turn - execution.started_turn),
          totalTurns: Math.max(1, execution.temporary_until_turn - execution.started_turn),
          turnsRemaining: Math.max(0, execution.temporary_until_turn - state.turn),
          fraction: Math.min(1, Math.max(0, (state.turn - execution.started_turn) / Math.max(1, execution.temporary_until_turn - execution.started_turn))),
        }
      : undefined;
    const status: DecisionView["status"] = running
      ? "running"
      : cooldownRemaining > 0
        ? "cooldown"
        : unmetConditions.some((value) => value.startsWith("정치력"))
          ? "insufficient"
          : unmetConditions.length > 0
            ? "locked"
            : "ready";
    return {
      ...definition,
      visible: isVisible(definition, state),
      available: unmetConditions.length === 0,
      unmetConditions,
      cooldownRemaining,
      selectedTargetId: selectedTargets[definition.id],
      status,
      progress,
    };
  });
  return {
    countryKey,
    worldDate: state.worldDate,
    turn: state.turn,
    politicalPower: state.metrics?.political_power ?? null,
    parties: state.parties,
    decisions,
    activeModifiers: state.modifiers.map((row) => ({
      decisionId: row.decision_id,
      label: row.effect_key,
      value: row.value,
      unit: row.unit,
      turnsRemaining: Math.max(0, row.expires_turn - state.turn),
    })),
  };
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

type TemporaryEffect = { effectKey: string; value: number; unit: "percentage_point" | "relative_percent" };

function temporaryEffects(decisionId: string): TemporaryEffect[] {
  switch (decisionId) {
    case "crackdown_political_violence": return [{ effectKey: "political_power_gain_modifier", value: -10, unit: "relative_percent" }];
    case "improve_labor_conditions": return [{ effectKey: "production_capacity_modifier", value: -7.5, unit: "relative_percent" }];
    case "austerity": return [
      { effectKey: "budget_fulfillment_rate", value: 10, unit: "percentage_point" },
      { effectKey: "nominal_growth_rate", value: -0.5, unit: "percentage_point" },
    ];
    case "public_works": return [
      { effectKey: "nominal_growth_rate", value: 0.5, unit: "percentage_point" },
      { effectKey: "budget_fulfillment_rate", value: -10, unit: "percentage_point" },
    ];
    case "emergency_relief": return [{ effectKey: "budget_fulfillment_rate", value: -7.5, unit: "percentage_point" }];
    case "special_tax": return [
      { effectKey: "national_income", value: 10, unit: "relative_percent" },
      { effectKey: "nominal_growth_rate", value: -0.25, unit: "percentage_point" },
    ];
    case "corporate_tax_benefits": return [
      { effectKey: "production_capacity_modifier", value: 7.5, unit: "relative_percent" },
      { effectKey: "nominal_growth_rate", value: 0.5, unit: "percentage_point" },
      { effectKey: "tax_collection_efficiency", value: -10, unit: "relative_percent" },
    ];
    case "research_subsidies": return [
      { effectKey: "research_capacity", value: 10, unit: "relative_percent" },
      { effectKey: "budget_fulfillment_rate", value: -5, unit: "percentage_point" },
    ];
    case "recruitment_campaign": return [{ effectKey: "available_manpower", value: 5, unit: "relative_percent" }];
    case "total_mobilization_propaganda": return [
      { effectKey: "available_manpower", value: 10, unit: "relative_percent" },
      { effectKey: "production_capacity_modifier", value: 5, unit: "relative_percent" },
    ];
    default: return [];
  }
}

export async function executeCommonDecision(
  admin: AdminClient,
  countryKey: string,
  userId: string | null,
  decisionId: string,
  targetPartyId?: string,
): Promise<DecisionOverview> {
  const definition = COMMON_DECISIONS.find((row) => row.id === decisionId);
  if (!definition) throw new Error("DECISION_NOT_FOUND");
  const state = await loadDecisionRuntime(admin, countryKey);
  if (!isVisible(definition, state)) throw new Error("DECISION_NOT_VISIBLE");
  const unmet = decisionUnmetConditions(definition, state, targetPartyId);
  if (unmet.length > 0) throw new Error(`DECISION_CONDITIONS_UNMET:${unmet.join("|")}`);
  const metrics = state.metrics;
  if (!metrics || metrics.political_power === null) throw new Error("DECISION_DATA_UNAVAILABLE");
  const metricPatch: Record<string, number | string> = {
    country_key: countryKey,
    political_power: metrics.political_power - definition.politicalPowerCost,
  };
  const stability = metrics.stability ?? 0;
  const warSupport = metrics.war_support ?? 0;
  switch (decisionId) {
    case "ideology_repression": metricPatch.stability = clamp(stability - 2.5); break;
    case "crackdown_political_violence": metricPatch.stability = clamp(stability + 5); break;
    case "peace_propaganda": metricPatch.stability = clamp(stability + 5); metricPatch.war_support = clamp(warSupport - 7.5); break;
    case "improve_labor_conditions": metricPatch.stability = clamp(stability + 5); metricPatch.living_standard_stage = Math.min(metrics.living_standard_max_stage ?? 0, (metrics.living_standard_stage ?? 0) + 1); break;
    case "austerity":
    case "special_tax": metricPatch.stability = clamp(stability - 5); break;
    case "emergency_relief": metricPatch.stability = clamp(stability + 3); metricPatch.poverty_rate = Math.max(0, (metrics.poverty_rate ?? 0) - 2.5); break;
    case "war_propaganda": metricPatch.war_support = clamp(warSupport + 7.5); break;
    case "recruitment_campaign": metricPatch.stability = clamp(stability - 2.5); break;
    case "total_mobilization_propaganda": metricPatch.stability = clamp(stability - 5); metricPatch.war_support = clamp(warSupport + 5); break;
  }
  if (decisionId === "public_works") {
    const result = await admin.from("country_economies").update({ unemployment_rate: Math.max(0, (state.economy?.unemployment_rate ?? 0) - 1.5) }).eq("country_key", countryKey);
    if (result.error) throw result.error;
  }
  if (targetPartyId && (decisionId === "ideology_repression" || decisionId === "ideology_propaganda")) {
    const adjusted = state.parties.map((party) => ({ ...party }));
    const selected = adjusted.find((party) => party.id === targetPartyId);
    if (!selected) throw new Error("DECISION_TARGET_INVALID");
    selected.support = Math.max(0, selected.support + (decisionId === "ideology_repression" ? -3 : 3));
    if (decisionId === "ideology_propaganda") {
      const total = adjusted.reduce((sum, party) => sum + party.support, 0);
      if (total > 100) for (const party of adjusted) party.support = party.support / total * 100;
    }
    const partyWrite = await admin.from("country_decision_party_support").upsert(adjusted.map((party) => ({ country_key: countryKey, party_id: party.id, support: Number(party.support.toFixed(3)) })), { onConflict: "country_key,party_id" });
    if (partyWrite.error) throw partyWrite.error;
  }
  const metricWrite = await admin.from("country_decision_states").upsert(metricPatch, { onConflict: "country_key" });
  if (metricWrite.error) throw metricWrite.error;
  const effects = temporaryEffects(decisionId);
  if (effects.length > 0) {
    const modifierWrite = await admin.from("country_decision_modifiers").upsert(effects.map((effect) => ({
      country_key: countryKey,
      decision_id: decisionId,
      effect_key: effect.effectKey,
      value: effect.value,
      unit: effect.unit,
      started_turn: state.turn,
      expires_turn: state.turn + (definition.durationTurns ?? 0),
    })), { onConflict: "country_key,decision_id,effect_key" });
    if (modifierWrite.error) throw modifierWrite.error;
  }
  const executionWrite = await admin.from("country_decision_executions").insert({
    country_key: countryKey,
    decision_id: decisionId,
    target_party_id: targetPartyId ?? null,
    started_turn: state.turn,
    cooldown_until_turn: state.turn + definition.cooldownTurns,
    temporary_until_turn: definition.durationTurns ? state.turn + definition.durationTurns : null,
    effects: definition.effects,
    executed_by: userId,
  });
  if (executionWrite.error) throw executionWrite.error;
  const refreshed = await loadDecisionRuntime(admin, countryKey);
  return decisionOverview(countryKey, refreshed, { [decisionId]: targetPartyId });
}

export function decisionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return ["DECISION_NOT_FOUND", "DECISION_NOT_VISIBLE", "DECISION_CONDITIONS_UNMET", "DECISION_TARGET_INVALID", "DECISION_DATA_UNAVAILABLE"]
    .find((code) => message.startsWith(code)) ?? "DECISION_DATA_UNAVAILABLE";
}
