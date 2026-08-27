import { describe, expect, it } from "vitest";
import nationalSpirits from "../src/data/generated/countryNationalSpirits.json";
import economyStates from "../src/features/economy/data/countryEconomyStates.json";
import lawStates from "../src/features/politics/data/generated/countryLawStates.json";
import lawDefinitions from "../src/features/politics/data/generated/lawDefinitions.json";

describe("TLR 1932 최신 시작 데이터", () => {
  it("법률 선택지에 임시 단계 설명을 노출하지 않는다", () => {
    const descriptions = lawDefinitions.flatMap((law) => law.options.map((option) => option.description));
    expect(descriptions.some((description) => description.endsWith("단계입니다."))).toBe(false);
    expect(lawDefinitions[0]?.options[1]?.description).toBe("복수 정당이 존재하지만 한 정당이 제도를 주도합니다.");
  });

  it("62개국 국민정신 233개와 수치 효과를 제공한다", () => {
    expect(Object.keys(nationalSpirits)).toHaveLength(62);
    expect(Object.values(nationalSpirits).flat()).toHaveLength(233);
    expect(
      Object.values(nationalSpirits)
        .flat()
        .every((spirit) =>
          spirit.name.length > 0 &&
          spirit.description.length > 0 &&
          spirit.imagePath.startsWith("/assets/national-spirits/") &&
          spirit.effects.length > 0,
        ),
    ).toBe(true);
  });

  it("62개국 경제 시작값과 예산·산업구조를 제공한다", () => {
    expect(Object.keys(economyStates)).toHaveLength(62);
    for (const economy of Object.values(economyStates)) {
      expect(Object.values(economy.current_budget).reduce((sum, value) => sum + value, 0)).toBe(100);
      expect(Object.values(economy.industrial_structure).reduce((sum, value) => sum + value, 0)).toBe(100);
      expect(economy.gdp).toBeGreaterThan(0);
      expect(economy.base_production_capacity).toBeGreaterThan(0);
    }
  });

  it("62개국의 28개 시작 법률이 실제 선택지 ID를 참조한다", () => {
    const allowed = new Map(
      lawDefinitions.map((law) => [
        law.id,
        new Set(law.options.map((option) => option.id)),
      ]),
    );
    expect(Object.keys(lawStates)).toHaveLength(62);
    for (const state of Object.values(lawStates)) {
      expect(Object.keys(state.laws)).toHaveLength(28);
      for (const [lawId, optionId] of Object.entries(state.laws)) {
        expect(allowed.get(lawId)?.has(optionId)).toBe(true);
      }
    }
  });
});
