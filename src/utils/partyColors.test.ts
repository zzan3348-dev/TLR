import { describe, expect, it } from "vitest";
import type { PartyIdeologyCategory } from "../data/partyIdeologies";
import type { CountryPartyPresentation } from "../types/countryPresentation";
import { getPartyDisplayColor, PARTY_CATEGORY_COLORS } from "./partyColors";

const expectedPalette: Readonly<Record<PartyIdeologyCategory, string>> = {
  전위사회주의: "#8F242C",
  평의회사회주의: "#A13B35",
  생디칼리슴: "#A9512C",
  자유사회주의: "#684763",
  사회민주주의: "#79384A",
  급진공화주의: "#A47A32",
  자유주의: "#35658C",
  보수주의: "#294A79",
  권위주의: "#56636B",
  군주주의: "#514766",
  반동주의: "#612E2E",
  국가재생주의: "#2C4947",
};

describe("partyColors", () => {
  it("12개 대분류에 고정 팔레트를 사용한다", () => {
    expect(PARTY_CATEGORY_COLORS).toEqual(expectedPalette);
  });

  it("표시 색상은 정당의 임의 색상이 아니라 대분류로 결정한다", () => {
    const party: CountryPartyPresentation = {
      id: "test-party",
      name: "공화당",
      ideologyCategory: "보수주의",
      subIdeology: "전통보수주의",
      support: 41,
      color: "#000000",
      symbolPath: null,
    };

    expect(getPartyDisplayColor(party)).toBe("#294A79");
  });
});
