import { describe, expect, it } from "vitest";
import { aggregateModifiers } from "../src/features/politics/types/modifiers";
import { countryDevelopmentStates } from "../src/features/politics/data/countryDevelopmentStates";
import { developmentDefinitions } from "../src/features/politics/data/developmentDefinitions";
import { countryLawStates } from "../src/features/politics/data/countryLawStates";
import { DEV_DEVELOPMENT_SAMPLE } from "../src/features/politics/data/devDevelopmentSample";
import { DEV_LAW_SAMPLE } from "../src/features/politics/data/devLawSample";
import { lawDefinitions } from "../src/features/politics/data/lawDefinitions";
import { countryResourceStates } from "../src/features/economy/data/countryResourceStates";
import { mapCountries } from "../src/data/mapCountries";
import {
  createUnsetDevelopmentState,
  resolveDevelopmentRows,
} from "../src/features/politics/utils/developmentState";

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
      expect(definition.options).toHaveLength(5);
      expect(new Set(definition.options.map(({ id }) => id)).size).toBe(
        definition.options.length,
      );
    }
  });

  it("62개국 실제 시작 상태와 개발용 예시 상태를 분리한다", () => {
    expect(Object.keys(countryLawStates)).toHaveLength(62);
    expect(
      Object.values(countryLawStates).every(
        ({ laws }) => Object.keys(laws).length === 28,
      ),
    ).toBe(true);
    expect(Object.keys(countryDevelopmentStates)).toHaveLength(62);
    expect(DEV_LAW_SAMPLE.countryId).toBe("__development_fixture__");
    expect(DEV_DEVELOPMENT_SAMPLE.countryId).toBe(
      "__development_fixture__",
    );
  });

  it("통합 기준본의 140개 법률 선택지와 62개국 자원 시작값을 제공한다", () => {
    expect(lawDefinitions.flatMap(({ options }) => options)).toHaveLength(140);
    expect(Object.keys(countryResourceStates)).toHaveLength(62);
    expect(Object.values(countryResourceStates).every((rows) => rows.length === 5)).toBe(true);
  });

  it("사회 발전 항목 8개와 단계 데이터를 제공한다", () => {
    expect(developmentDefinitions).toHaveLength(8);
    for (const definition of developmentDefinitions) {
      expect(definition.levels).toHaveLength(5);
    }
  });

  it("전체·부분·미설정 상태에서도 정의된 8개 항목을 같은 순서로 해석한다", () => {
    const fullRows = resolveDevelopmentRows(DEV_DEVELOPMENT_SAMPLE);
    const partialRows = resolveDevelopmentRows({
      countryId: "partial-country",
      povertyRate: 19.5,
      povertyChange: null,
      items: [
        { id: "academic-foundation", level: 2, trend: "up" },
        { id: "health", level: 999, trend: "down" },
      ],
    });
    const unsetRows = resolveDevelopmentRows(
      createUnsetDevelopmentState("unset-country"),
    );
    const definitionIds = developmentDefinitions.map(({ id }) => id);

    expect(fullRows.map(({ definition }) => definition.id)).toEqual(
      definitionIds,
    );
    expect(fullRows.every(({ level }) => level !== null)).toBe(true);
    expect(partialRows.map(({ definition }) => definition.id)).toEqual(
      definitionIds,
    );
    expect(partialRows[0]?.level?.name).toBe("초등교육 보급");
    expect(partialRows[3]?.item?.trend).toBe("down");
    expect(partialRows[3]?.level).toBeNull();
    expect(partialRows[1]?.item).toBeNull();
    expect(unsetRows).toHaveLength(8);
    expect(unsetRows.every(({ item, level }) => item === null && level === null)).toBe(
      true,
    );
  });

  it("62개 국가 모두 누락 없이 8개 사회 발전 정의로 해석된다", () => {
    expect(mapCountries).toHaveLength(62);

    for (const country of mapCountries) {
      const state =
        countryDevelopmentStates[country.key] ??
        createUnsetDevelopmentState(country.key);
      const rows = resolveDevelopmentRows(state);

      expect(rows).toHaveLength(8);
      expect(rows.every(({ level }) => level !== null)).toBe(true);
      expect(new Set(rows.map(({ definition }) => definition.id)).size).toBe(8);
      expect(
        rows.every(
          ({ item, level }) =>
            item === null || item.level === null || level !== null,
        ),
      ).toBe(true);
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
