import { describe, expect, it } from "vitest";
import { eventTriggerInstanceIds } from "../server/eventRuntime";
import { evaluateManagementConditions } from "../server/managementConditions";
import type { DecisionRuntimeState } from "../server/decisions";

const runtime = {
  worldDate: "1932-04-10",
  turn: 3,
  metrics: { country_key: "country-013", political_power: 300, political_power_gain_modifier: 0, stability: 58, war_support: 62, poverty_rate: 10, living_standard_stage: 2, living_standard_max_stage: 5 },
  economy: null,
  manpower: 1000,
  atWar: false,
  parties: [{ id: "party", name: "당", subIdeology: "사회민주주의", ideologyCategory: "사회민주주의", support: 50, ruling: true }],
  modifiers: [],
  executions: [],
} satisfies DecisionRuntimeState;

describe("management condition engine", () => {
  it("distinguishes world date and turn conditions", () => {
    const result = evaluateManagementConditions({ id: "root", mode: "ALL", conditions: [
      { id: "date", kind: "worldDate", operator: "after", value: "1932-04-01" },
      { id: "turn", kind: "turn", operator: "gte", value: 3 },
      { id: "peace", kind: "atWar", operator: "equals", value: false },
    ] }, "country-013", runtime);
    expect(result.satisfied).toBe(true);
  });

  it("reports a failed current-state condition", () => {
    const result = evaluateManagementConditions({ id: "root", mode: "ALL", conditions: [
      { id: "stability", kind: "stability", operator: "gte", value: 70 },
    ] }, "country-013", runtime);
    expect(result.satisfied).toBe(false);
    expect(result.failures).toEqual(["stability:gte:70"]);
  });
});

describe("event trigger delivery", () => {
  it("only exposes a manual delivery to its selected country after its date", () => {
    const row = { id: "event_a", payload: { trigger: { mode: "manual" }, deliveries: [{ id: "dispatch:event_a:country-013:1", countryKey: "country-013", availableWorldDate: "1932-04-10" }] } };
    expect(eventTriggerInstanceIds(row, "country-013", "1932-04-09", 3)).toEqual([]);
    expect(eventTriggerInstanceIds(row, "country-013", "1932-04-10", 3)).toEqual(["dispatch:event_a:country-013:1"]);
    expect(eventTriggerInstanceIds(row, "country-008", "1932-04-10", 3)).toEqual([]);
  });

  it("keeps date and turn trigger instance keys independent", () => {
    const date = eventTriggerInstanceIds({ id: "event_a", payload: { trigger: { mode: "worldDateReached", worldDate: "1932-04-01" } } }, "country-013", "1932-04-10", 1);
    const turn = eventTriggerInstanceIds({ id: "event_a", payload: { trigger: { mode: "turnStarted", turnId: 3 } } }, "country-013", "1932-01-01", 3);
    expect(date[0]).toContain(":date:");
    expect(turn[0]).toContain(":turn:");
  });
});
