import { describe, expect, it } from "vitest";
import {
  calculateNationalStats,
  collectCountryStatModifiers,
  validatedLawChoices,
} from "../server/countryStatModifiers";
import countryBaseStats from "../src/features/play/data/countryBaseStats.json";

describe("국가 기본수치 modifier 계산", () => {
  it("62개국 모두 시작 법률·국민정신 적용 결과가 유한한 값이다", () => {
    expect(Object.keys(countryBaseStats)).toHaveLength(62);
    for (const [countryKey, base] of Object.entries(countryBaseStats)) {
      const result = calculateNationalStats({
        basePoliticalPower: base.base_political_power,
        basePoliticalPowerPerTurn: base.political_power_per_turn,
        baseStability: base.base_stability,
        baseWarSupport: base.base_war_support,
        baseAvailableManpower: base.base_available_manpower,
        modifiers: collectCountryStatModifiers(countryKey),
      });
      expect(Number.isFinite(result.availableManpower), countryKey).toBe(true);
      expect(Number.isFinite(result.stability), countryKey).toBe(true);
      expect(Number.isFinite(result.warSupport), countryKey).toBe(true);
      expect(Number.isFinite(result.politicalPowerPerTurn), countryKey).toBe(true);
      expect(result.availableManpower, countryKey).toBeGreaterThanOrEqual(0);
    }
  });

  it("징병법 변경은 이전 결과가 아니라 기본값에서 다시 계산한다", () => {
    const volunteer = collectCountryStatModifiers("country-002");
    const limited = collectCountryStatModifiers("country-002", { service: "service:limited" });
    const volunteerPercent = volunteer
      .filter((item) => item.key === "available_manpower")
      .reduce((sum, item) => sum + item.value, 0);
    const limitedPercent = limited
      .filter((item) => item.key === "available_manpower")
      .reduce((sum, item) => sum + item.value, 0);
    expect(limitedPercent - volunteerPercent).toBe(25);

    const input = {
      basePoliticalPower: 300,
      basePoliticalPowerPerTurn: 200,
      baseStability: 100,
      baseWarSupport: 60,
      baseAvailableManpower: 1_000_000,
      activeMilitaryManpower: 100_000,
      reservedManpower: 25_000,
    };
    const first = calculateNationalStats({ ...input, modifiers: volunteer });
    const changed = calculateNationalStats({ ...input, modifiers: limited });
    const repeated = calculateNationalStats({ ...input, modifiers: limited });
    expect(changed.mobilizableManpower - first.mobilizableManpower).toBe(250_000);
    expect(repeated).toEqual(changed);
    expect(changed.availableManpower).toBe(changed.mobilizableManpower - 125_000);
  });

  it("잘못된 클라이언트 법률 선택은 국가 시작법으로 되돌린다", () => {
    const choices = validatedLawChoices("country-002", {
      service: "income-tax:high",
      unknown: "service:mass",
    });
    expect(choices.service).toBe("service:volunteer");
    expect(choices.unknown).toBeUndefined();
  });

  it("퍼센트는 가산하고 퍼센트포인트는 기본 안정도·전쟁지지도에 더한다", () => {
    const result = calculateNationalStats({
      basePoliticalPower: 300,
      basePoliticalPowerPerTurn: 200,
      baseStability: 100,
      storedStability: 95,
      baseWarSupport: 60,
      storedWarSupport: 65,
      baseAvailableManpower: 1_000_000,
      modifiers: [
        { key: "available_manpower", value: 10, unit: "relative_percent", sourceType: "law", sourceId: "a", label: "A" },
        { key: "available_manpower", value: 5, unit: "relative_percent", sourceType: "decision", sourceId: "b", label: "B" },
        { key: "stability", value: -10, unit: "percentage_point", sourceType: "law", sourceId: "a", label: "A" },
        { key: "war_support", value: 7.5, unit: "percentage_point", sourceType: "national_spirit", sourceId: "c", label: "C" },
      ],
    });
    expect(result.manpowerModifierPercent).toBe(15);
    expect(result.mobilizableManpower).toBe(1_150_000);
    expect(result.stability).toBe(85);
    expect(result.warSupport).toBe(72.5);
  });
});
