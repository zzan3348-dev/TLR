import {
  COLONIAL_EFFECT_LABELS,
  aggregateColonialEffects,
  createInitialColonialState,
  formatColonialEffect,
  getColonialDecisionCategory,
  type ColonialDecisionCategory,
  type ColonialDecisionDefinition,
  type ColonialDecisionOverview,
  type ColonialDecisionState,
  type ColonialEffect,
} from "../src/features/decisions/data/colonialDecisions.js";
import type { AdminClient } from "./auth.js";
import { loadDecisionRuntime, type DecisionRuntimeState } from "./decisions.js";

type ColonialStateRow = {
  country_key: string;
  category_key: string;
  policy_levels: Record<string, number> | null;
  admin_network_level: number | null;
  relief_frozen: boolean | null;
};

const PERMANENT_TURN = 2_147_483_647;

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedState(category: ColonialDecisionCategory, row?: ColonialStateRow | null): ColonialDecisionState {
  const initial = createInitialColonialState(category);
  return {
    policyLevels: Object.fromEntries((category.policies ?? []).map((policy) => {
      const value = Number(row?.policy_levels?.[policy.id]);
      return [policy.id, Number.isFinite(value) ? clamp(value, policy.minimumLevel, policy.maximumLevel) : initial.policyLevels[policy.id]];
    })),
    adminNetworkLevel: clamp(Number(row?.admin_network_level ?? 0), 0, 3),
    reliefFrozen: Boolean(row?.relief_frozen),
  };
}

async function loadColonialState(admin: AdminClient, category: ColonialDecisionCategory): Promise<ColonialDecisionState> {
  const result = await admin.from("country_colonial_decision_states").select("*").eq("country_key", category.countryKey).maybeSingle<ColonialStateRow>();
  if (result.error) throw result.error;
  const state = normalizedState(category, result.data);
  if (!result.data) {
    const write = await admin.from("country_colonial_decision_states").upsert({
      country_key: category.countryKey,
      category_key: category.key,
      policy_levels: state.policyLevels,
      admin_network_level: state.adminNetworkLevel,
      relief_frozen: state.reliefFrozen,
    }, { onConflict: "country_key" });
    if (write.error) throw write.error;
  }
  return state;
}

function effectRows(countryKey: string, category: ColonialDecisionCategory, state: ColonialDecisionState, turn: number) {
  const rows: Array<Record<string, string | number>> = [];
  const add = (decisionId: string, effects: readonly ColonialEffect[], multiplier = 1) => {
    for (const effect of effects) rows.push({
      country_key: countryKey,
      decision_id: decisionId,
      effect_key: effect.key,
      value: effect.value * multiplier,
      unit: effect.unit,
      started_turn: turn,
      expires_turn: PERMANENT_TURN,
    });
  };
  add(`colonial_base:${category.key}`, category.baseEffects);
  for (const policy of category.policies ?? []) add(`colonial_policy:${policy.id}`, policy.effectsPerLevel, state.policyLevels[policy.id] ?? policy.initialLevel);
  if (category.countryKey === "country-051" && state.adminNetworkLevel > 0) add("colonial_admin_network", [
    { key: "available_manpower", value: 5, unit: "relative_percent" },
    { key: "tax_collection_efficiency", value: 5, unit: "relative_percent" },
    { key: "national_income", value: 2.5, unit: "relative_percent" },
    { key: "budget_fulfillment_rate", value: -5, unit: "percentage_point" },
  ], state.adminNetworkLevel);
  return rows;
}

async function syncPersistentModifiers(admin: AdminClient, category: ColonialDecisionCategory, state: ColonialDecisionState, turn: number): Promise<void> {
  const rows = effectRows(category.countryKey, category, state, turn);
  if (!rows.length) return;
  const result = await admin.from("country_decision_modifiers").upsert(rows, { onConflict: "country_key,decision_id,effect_key" });
  if (result.error) throw result.error;
}

function conditionFailures(definition: ColonialDecisionDefinition, category: ColonialDecisionCategory, state: ColonialDecisionState, runtime: DecisionRuntimeState): string[] {
  const failures: string[] = [];
  const pp = runtime.metrics?.political_power;
  if (pp === null || pp === undefined) failures.push("정치력 미설정");
  else if (pp < definition.politicalPowerCost) failures.push(`정치력 ${definition.politicalPowerCost} 필요`);
  const cooldown = runtime.executions.find((row) => row.decision_id === definition.id);
  if (cooldown && cooldown.cooldown_until_turn > runtime.turn) failures.push(`재사용 대기 ${cooldown.cooldown_until_turn - runtime.turn}턴`);
  if (runtime.modifiers.some((row) => row.decision_id === definition.id)) failures.push("동일 결정의 효과가 적용 중");
  for (const condition of definition.conditions ?? []) {
    if (condition.metric === "relief_frozen") {
      if (!state.reliefFrozen && (runtime.metrics?.poverty_rate ?? -Infinity) < 20) failures.push(condition.label);
      continue;
    }
    const actual = runtime.metrics?.[condition.metric];
    if (actual === null || actual === undefined) failures.push(`${condition.metric === "stability" ? "안정도" : "빈곤율"} 미설정`);
    else if (condition.operator === "lte" ? actual > condition.value : actual < condition.value) failures.push(condition.label);
  }
  const action = definition.action;
  if (action?.type === "policy_level") {
    const policy = category.policies?.find((item) => item.id === action.policyId);
    if (policy) {
      const next = (state.policyLevels[policy.id] ?? policy.initialLevel) + action.delta;
      if (next < policy.minimumLevel) failures.push("이미 최소 단계입니다");
      if (next > policy.maximumLevel) failures.push("이미 최대 단계입니다");
    }
  }
  if (action?.type === "admin_network" && state.adminNetworkLevel >= 3) failures.push("행정망이 이미 최대 단계입니다");
  return [...new Set(failures)];
}

function overview(category: ColonialDecisionCategory, state: ColonialDecisionState, runtime: DecisionRuntimeState): ColonialDecisionOverview {
  const categorySummary: ColonialDecisionOverview["category"] = {
    countryKey: category.countryKey,
    key: category.key,
    title: category.title,
    description: category.description,
    headerAssetKey: category.headerAssetKey,
    headerImage: category.headerImage,
    baseEffects: category.baseEffects,
    policies: category.policies,
  };
  return {
    mode: "colonial",
    countryKey: category.countryKey,
    worldDate: runtime.worldDate,
    turn: runtime.turn,
    politicalPower: runtime.metrics?.political_power ?? null,
    category: categorySummary,
    state,
    decisions: category.decisions.map((definition) => {
      const unmetConditions = conditionFailures(definition, category, state, runtime);
      return {
        ...definition,
        available: unmetConditions.length === 0,
        unmetConditions,
        cooldownRemaining: Math.max(0, (runtime.executions.find((row) => row.decision_id === definition.id)?.cooldown_until_turn ?? runtime.turn) - runtime.turn),
      };
    }),
    appliedEffects: aggregateColonialEffects(category, state),
    activeModifiers: runtime.modifiers
      .filter((row) => !row.decision_id.startsWith("colonial_base:") && !row.decision_id.startsWith("colonial_policy:") && row.decision_id !== "colonial_admin_network")
      .map((row) => ({ decisionId: row.decision_id, label: COLONIAL_EFFECT_LABELS[row.effect_key as keyof typeof COLONIAL_EFFECT_LABELS] ?? row.effect_key, value: row.value, unit: row.unit, turnsRemaining: Math.max(0, row.expires_turn - runtime.turn) })),
  };
}

export function isColonialDecisionCountry(countryKey: string): boolean {
  return getColonialDecisionCategory(countryKey) !== null;
}

export async function colonialDecisionOverview(admin: AdminClient, countryKey: string): Promise<ColonialDecisionOverview> {
  const category = getColonialDecisionCategory(countryKey);
  if (!category) throw new Error("DECISION_NOT_FOUND");
  const state = await loadColonialState(admin, category);
  const runtime = await loadDecisionRuntime(admin, countryKey);
  await syncPersistentModifiers(admin, category, state, runtime.turn);
  return overview(category, state, await loadDecisionRuntime(admin, countryKey));
}

async function applyImmediateEffects(admin: AdminClient, countryKey: string, runtime: DecisionRuntimeState, effects: readonly ColonialEffect[], ppCost: number): Promise<void> {
  const metricPatch: Record<string, string | number> = { country_key: countryKey, political_power: (runtime.metrics?.political_power ?? 0) - ppCost };
  const economyPatch: Record<string, string | number> = { country_key: countryKey };
  let manpower: number | null = null;
  for (const effect of effects) {
    switch (effect.key) {
      case "stability": metricPatch.stability = clamp((runtime.metrics?.stability ?? 0) + effect.value); break;
      case "poverty_rate": metricPatch.poverty_rate = clamp((runtime.metrics?.poverty_rate ?? 0) + effect.value); break;
      case "living_standard_stage": metricPatch.living_standard_stage = clamp((runtime.metrics?.living_standard_stage ?? 0) + effect.value, 0, runtime.metrics?.living_standard_max_stage ?? Number.MAX_SAFE_INTEGER); break;
      case "political_power_gain_modifier": metricPatch.political_power_gain_modifier = (runtime.metrics?.political_power_gain_modifier ?? 0) + effect.value; break;
      case "national_income": economyPatch.national_income = (runtime.economy?.national_income ?? 0) + effect.value; break;
      case "tax_collection_efficiency": economyPatch.tax_collection_efficiency = clamp((runtime.economy?.tax_collection_efficiency ?? 0) + effect.value); break;
      case "budget_fulfillment_rate": economyPatch.budget_fulfillment_rate = clamp((runtime.economy?.budget_fulfillment_rate ?? 0) + effect.value); break;
      case "production_capacity_modifier": economyPatch.production_capacity_modifier = (runtime.economy?.production_capacity_modifier ?? 0) + effect.value; break;
      case "available_manpower": manpower = (runtime.manpower ?? 0) + effect.value; break;
    }
  }
  const metricWrite = await admin.from("country_decision_states").upsert(metricPatch, { onConflict: "country_key" });
  if (metricWrite.error) throw metricWrite.error;
  if (Object.keys(economyPatch).length > 1) {
    const economyWrite = await admin.from("country_economies").upsert(economyPatch, { onConflict: "country_key" });
    if (economyWrite.error) throw economyWrite.error;
  }
  if (manpower !== null) {
    const manpowerWrite = await admin.from("country_military_resources").upsert({ country_key: countryKey, available_manpower: manpower }, { onConflict: "country_key" });
    if (manpowerWrite.error) throw manpowerWrite.error;
  }
}

export async function executeColonialDecision(admin: AdminClient, countryKey: string, userId: string | null, decisionId: string): Promise<ColonialDecisionOverview> {
  const category = getColonialDecisionCategory(countryKey);
  const definition = category?.decisions.find((item) => item.id === decisionId);
  if (!category || !definition) throw new Error("DECISION_NOT_FOUND");
  const state = await loadColonialState(admin, category);
  const runtime = await loadDecisionRuntime(admin, countryKey);
  const failures = conditionFailures(definition, category, state, runtime);
  if (failures.length) throw new Error(`DECISION_CONDITIONS_UNMET:${failures.join("|")}`);

  const nextState: ColonialDecisionState = { ...state, policyLevels: { ...state.policyLevels } };
  if (definition.action?.type === "policy_level") nextState.policyLevels[definition.action.policyId] += definition.action.delta;
  if (definition.action?.type === "admin_network") nextState.adminNetworkLevel += definition.action.delta;
  if (definition.action?.type === "relief_freeze") nextState.reliefFrozen = definition.action.value;
  const stateWrite = await admin.from("country_colonial_decision_states").upsert({
    country_key: countryKey,
    category_key: category.key,
    policy_levels: nextState.policyLevels,
    admin_network_level: nextState.adminNetworkLevel,
    relief_frozen: nextState.reliefFrozen,
    updated_at: new Date().toISOString(),
  }, { onConflict: "country_key" });
  if (stateWrite.error) throw stateWrite.error;

  await applyImmediateEffects(admin, countryKey, runtime, definition.immediateEffects ?? [], definition.politicalPowerCost);
  if (definition.temporaryEffects?.length) {
    const modifierWrite = await admin.from("country_decision_modifiers").upsert(definition.temporaryEffects.map((effect) => ({
      country_key: countryKey,
      decision_id: definition.id,
      effect_key: effect.key,
      value: effect.value,
      unit: effect.unit,
      started_turn: runtime.turn,
      expires_turn: runtime.turn + (definition.durationTurns ?? 0),
    })), { onConflict: "country_key,decision_id,effect_key" });
    if (modifierWrite.error) throw modifierWrite.error;
  }
  const executionWrite = await admin.from("country_decision_executions").insert({
    country_key: countryKey,
    decision_id: definition.id,
    started_turn: runtime.turn,
    cooldown_until_turn: runtime.turn + definition.cooldownTurns,
    temporary_until_turn: definition.durationTurns ? runtime.turn + definition.durationTurns : null,
    effects: [...(definition.immediateEffects ?? []), ...(definition.temporaryEffects ?? [])],
    executed_by: userId,
  });
  if (executionWrite.error) throw executionWrite.error;
  await syncPersistentModifiers(admin, category, nextState, runtime.turn);
  return colonialDecisionOverview(admin, countryKey);
}

export function colonialDecisionTooltip(definition: ColonialDecisionDefinition): string[] {
  return [...(definition.immediateEffects ?? []), ...(definition.temporaryEffects ?? [])].map(formatColonialEffect);
}
