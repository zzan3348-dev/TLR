import { describe, expect, it } from "vitest";
import { formatEventEffects } from "../src/features/effects/effectFormatter";
import { resolveNationalSpiritDefinition } from "../src/features/effects/nationalSpiritRegistry";
import { SandboxEffectEngine } from "../src/features/effects/sandboxEffectEngine";
import { parseEventExecutionBody } from "../server/eventEffects";

describe("이벤트 공통 Effect Engine", () => {
  it("여러 효과를 한 번만 일괄 적용한다", async () => {
    const engine = new SandboxEffectEngine({
      "country-013": { stats: { stability: 32, productionCapacity: 100 }, spiritIds: [] },
    });
    const execution = {
      eventId: "test-event",
      eventInstanceId: "test-instance",
      choiceId: "restore-order",
      effects: [
        { type: "modify_country_value" as const, targetCountryIds: ["country-013"], statKey: "stability" as const, amount: 3 },
        { type: "modify_country_value" as const, targetCountryIds: ["country-013"], statKey: "productionCapacity" as const, amount: -20 },
        { type: "add_national_spirit" as const, targetCountryIds: ["country-013"], spiritId: "aging-revolution", duration: 180 },
      ],
    };

    expect(await engine.execute(execution)).toEqual({ applied: true, duplicate: false });
    expect(await engine.execute(execution)).toEqual({ applied: false, duplicate: true });
    const state = engine.snapshot()["country-013"];
    expect(state.stats).toMatchObject({ stability: 35, productionCapacity: 80 });
    expect(state.spiritIds).toEqual(["country-013:aging-revolution"]);
  });

  it("유효하지 않은 국민정신이 섞이면 어느 효과도 적용하지 않는다", async () => {
    const engine = new SandboxEffectEngine({
      "country-013": { stats: { stability: 32 }, spiritIds: [] },
    });
    await expect(engine.execute({
      eventId: "test-event",
      eventInstanceId: "rollback-instance",
      choiceId: "invalid-spirit",
      effects: [
        { type: "modify_country_value", targetCountryIds: ["country-013"], statKey: "stability", amount: 10 },
        { type: "add_national_spirit", targetCountryIds: ["country-013"], spiritId: "does-not-exist" },
      ],
    })).rejects.toThrow("UNKNOWN_NATIONAL_SPIRIT");
    expect(engine.snapshot()["country-013"].stats.stability).toBe(32);
  });

  it("대상 국가에 맞는 중앙 국민정신 정의와 표시명을 사용한다", () => {
    expect(resolveNationalSpiritDefinition("aging-revolution", "country-013")?.name).toBe("늙은 혁명");
    const lines = formatEventEffects([
      { type: "modify_country_value", targetCountryIds: ["country-013", "country-008"], statKey: "stability", amount: -2 },
      { type: "add_national_spirit", targetCountryIds: ["country-013"], spiritId: "aging-revolution", duration: 90 },
    ]);
    expect(lines.map(({ countryName }) => countryName)).toContain("프랑스 인민공화국");
    expect(lines.at(-1)?.text).toBe("국민정신 「늙은 혁명」 추가 · 90일");
  });

  it("서버 실행 식별자를 엄격하게 검사한다", () => {
    expect(parseEventExecutionBody({ eventId: "event-1", eventInstanceId: "instance:1", choiceId: "choice_1" })).toEqual({
      eventId: "event-1",
      eventInstanceId: "instance:1",
      choiceId: "choice_1",
    });
    expect(parseEventExecutionBody({ eventId: "bad event", eventInstanceId: "instance", choiceId: "choice" })).toBeNull();
  });
});
