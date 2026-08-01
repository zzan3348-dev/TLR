import { describe, expect, it } from "vitest";
import { aggregateModifiers } from "../src/features/politics/types/modifiers";
import { countryDevelopmentStates } from "../src/features/politics/data/countryDevelopmentStates";
import { developmentDefinitions } from "../src/features/politics/data/developmentDefinitions";
import { countryLawStates } from "../src/features/politics/data/countryLawStates";
import { DEV_DEVELOPMENT_SAMPLE } from "../src/features/politics/data/devDevelopmentSample";
import { DEV_LAW_SAMPLE } from "../src/features/politics/data/devLawSample";
import { lawDefinitions } from "../src/features/politics/data/lawDefinitions";

describe("정치·법률 데이터 구조", () => {
  it("요구된 카테고리별 법률 수와 선택지를 유지한다", () => {
    const counts = {
      political: lawDefinitions.filter(
        ({ category }) => category === "political",
      ),
      military: lawDefinitions.filter(
        ({ category }) => category === "military",
      ),
      economy: lawDefinitions.filter(
        ({ category }) => category === "economy",
      ),
      social: lawDefinitions.filter(
        ({ category }) => category === "social",
      ),
    };

    expect(counts.political).toHaveLength(8);
    expect(counts.military).toHaveLength(4);
    expect(counts.economy).toHaveLength(8);
    expect(counts.social).toHaveLength(8);

    for (const definition of lawDefinitions) {
      expect(definition.options.length).toBeGreaterThanOrEqual(5);
      expect(definition.options.length).toBeLessThanOrEqual(6);
      expect(new Set(definition.options.map(({ id }) => id)).size).toBe(
        definition.options.length,
      );
    }
  });

  it("실제 국가 상태와 개발용 예시 상태를 분리한다", () => {
    expect(Object.keys(countryLawStates)).toHaveLength(0);
    expect(Object.keys(countryDevelopmentStates)).toHaveLength(0);
    expect(DEV_LAW_SAMPLE.countryId).toBe("__development_fixture__");
    expect(DEV_DEVELOPMENT_SAMPLE.countryId).toBe(
      "__development_fixture__",
    );
  });

  it("사회 발전 항목 8개와 단계 데이터를 제공한다", () => {
    expect(developmentDefinitions).toHaveLength(8);
    for (const definition of developmentDefinitions) {
      expect(definition.levels).toHaveLength(5);
    }
  });

  it("동일한 수정치를 합산한다", () => {
    expect(
      aggregateModifiers([
        [
          { key: "stability", value: 4, unit: "percent" },
          { key: "stability", value: -1, unit: "percent" },
        ],
        [{ key: "research", value: 2, unit: "percent" }],
      ]),
    ).toEqual({ stability: 3, research: 2 });
  });
});
