import { describe, expect, it } from "vitest";
import type { PartyIdeologyCategory } from "../data/partyIdeologies";
import type { CountryPartyPresentation } from "../types/countryPresentation";
import { getPartyDisplayColor, PARTY_CATEGORY_COLORS } from "./partyColors";

const expectedPalette: Readonly<Record<PartyIdeologyCategory, string>> = {
  전위사회주의: "#C83A3A",
  평의회사회주의: "#E05A47",
  생디칼리슴: "#D96B2B",
  자유사회주의: "#B84AD7",
  사회민주주의: "#E878A7",
  급진공화주의: "#F0B34A",
  자유주의: "#4AA3FF",
  보수주의: "#3E6FD1",
  권위주의: "#6E7B8B",
  군주주의: "#7E57C2",
  반동주의: "#8C3C3C",
  국가재생주의: "#2F4F4F",
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

    expect(getPartyDisplayColor(party)).toBe("#3E6FD1");
  });
});
