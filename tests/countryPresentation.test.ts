import { describe, expect, it } from "vitest";
import { getCountryPresentation } from "../src/data/countryPresentation";
import { mapCountries } from "../src/data/mapCountries";

describe("countryPresentation", () => {
  it.each([
    [
      8,
      "북독일",
      "독일민주공화국",
      "Deutsche Demokratische Republik",
      "독일민주공화국",
    ],
    [
      17,
      "남독일",
      "바이에른사회주의공화국",
      "Sozialistische Republik Bayern",
      "바이에른사회주의공화국",
    ],
  ])(
    "독일권 국가 %i의 내부명·정식명·현지어명·지도명을 분리한다",
    (id, internalName, name, nativeName, mapLabel) => {
      const country = mapCountries.find((candidate) => candidate.id === id);

      expect(country).toBeDefined();
      expect(country?.internalName).toBe(internalName);
      expect(country?.name).toBe(name);
      expect(country?.nativeName).toBe(nativeName);
      expect(country?.mapLabel).toBe(mapLabel);
      expect(country?.allowShortMapLabel).toBe(false);

      if (!country) {
        return;
      }
      const presentation = getCountryPresentation(country);
      expect(presentation.title).toBe(name);
      expect(presentation.secondaryNames).toEqual([nativeName]);
    },
  );

  it("모든 명명된 국가에 보조 표시명을 제공하고 대한제국은 Korea로 표시한다", () => {
    const namedCountries = mapCountries.filter(({ name }) => name.trim());
    const missingSecondaryNames = namedCountries.filter(
      (country) =>
        getCountryPresentation(country).secondaryNames.length === 0,
    );
    const korea = namedCountries.find(({ id }) => id === 28);

    expect(missingSecondaryNames).toHaveLength(0);
    expect(korea).toBeDefined();
    if (!korea) {
      return;
    }
    expect(getCountryPresentation(korea).secondaryNames).toEqual([
      "大韓帝國",
    ]);
  });

  it("복수 현지어 국명을 순서대로 여러 줄에 제공한다", () => {
    const saxonyChu = mapCountries.find(({ id }) => id === 34);

    expect(saxonyChu).toBeDefined();
    if (!saxonyChu) {
      return;
    }
    expect(getCountryPresentation(saxonyChu).secondaryNames).toEqual([
      "Vereinigtes Königreich Sachsen–Chu",
      "薩克森－楚聯合王國",
    ]);
  });
});
