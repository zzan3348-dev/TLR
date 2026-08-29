import { describe, expect, it } from "vitest";
import countryBaseStats from "../src/features/play/data/countryBaseStats.json";
import countryEconomies from "../src/features/economy/data/countryEconomyStates.json";
import { mapCountries } from "../src/data/mapCountries";
import { getPlaySimulationState } from "../src/features/play/data/playSimulationState";

describe("62개국 상단 HUD 시작 데이터", () => {
  it("모든 국가에 확정 정치·군사 기본수치가 있다", () => {
    const rows = Object.values(countryBaseStats);
    expect(rows).toHaveLength(62);
    for (const row of rows) {
      expect(row.base_political_power).toBe(300);
      expect(row.political_power_per_turn).toBe(200);
      expect(row.base_stability).toBe(100);
      expect(row.base_war_support).toBe(60);
      expect(row.base_available_manpower).toBeGreaterThan(0);
    }
  });

  it("모든 국가에 HUD 경제·연구 원본값이 있다", () => {
    for (const key of Object.keys(countryBaseStats) as Array<keyof typeof countryEconomies>) {
      const economy = countryEconomies[key];
      expect(economy).toBeDefined();
      expect(economy.research_capacity).toBeGreaterThan(0);
      expect(economy.trade_capacity_provided).toBeGreaterThanOrEqual(0);
      expect(economy.bond_interest_rate).toBeGreaterThan(0);
      expect(economy.credit_rating).not.toMatch(/^(?:N\/A|미설정)?$/);
    }
  });

  it("API 응답 전에도 62개국 HUD가 확정 시작값을 표시한다", () => {
    for (const country of mapCountries) {
      const state = getPlaySimulationState(country, null);
      expect(state.politicalPower).toBe(300);
      expect(state.politicalPowerChange).toBe(200);
      expect(state.stability).toBe(100);
      expect(state.warSupport).toBe(60);
      expect(state.manpower).toBeGreaterThan(0);
      expect(state.gdp).toBeGreaterThan(0);
      expect(state.productionCapacity.total).toBeGreaterThan(0);
      expect(state.researchCapacity).toBeGreaterThan(0);
      expect(state.bondInterestRate).toBeGreaterThan(0);
      expect(state.creditRating).not.toBeNull();
    }
  });
});
