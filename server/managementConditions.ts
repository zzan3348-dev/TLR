import type { ManagementConditionGroup, ManagementConditionLeaf } from "../src/features/management/types.js";
import type { DecisionRuntimeState } from "./decisions.js";

function compare(left: string | number | boolean, operator: ManagementConditionLeaf["operator"], right: string | number | boolean): boolean {
  if (operator === "equals") return String(left) === String(right);
  if (operator === "notEquals") return String(left) !== String(right);
  const order = typeof left === "number"
    ? left - Number(right)
    : String(left).localeCompare(String(right));
  if (operator === "gte" || operator === "after") return order >= 0;
  if (operator === "lte" || operator === "before") return order <= 0;
  return false;
}

export function evaluateManagementConditions(
  group: ManagementConditionGroup,
  countryKey: string,
  state: DecisionRuntimeState,
): { satisfied: boolean; failures: string[] } {
  const failures: string[] = [];
  const results = group.conditions.map((condition) => {
    let actual: string | number | boolean | null = null;
    if (condition.kind === "country") actual = countryKey;
    if (condition.kind === "stability") actual = state.metrics?.stability ?? null;
    if (condition.kind === "warSupport") actual = state.metrics?.war_support ?? null;
    if (condition.kind === "atWar") actual = state.atWar;
    if (condition.kind === "worldDate") actual = state.worldDate;
    if (condition.kind === "turn") actual = state.turn;
    if (condition.kind === "ideology") {
      const ruling = state.parties.find((party) => party.ruling);
      actual = ruling?.ideologyCategory ?? ruling?.subIdeology ?? null;
    }
    const satisfied = actual !== null && compare(actual, condition.operator, condition.value);
    if (!satisfied) failures.push(`${condition.kind}:${condition.operator}:${String(condition.value)}`);
    return satisfied;
  });
  return {
    satisfied: results.length === 0 || (group.mode === "ALL" ? results.every(Boolean) : results.some(Boolean)),
    failures,
  };
}
