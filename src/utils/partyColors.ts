import type { PartyIdeologyCategory } from "../data/partyIdeologies";
import type { CountryPartyPresentation } from "../types/countryPresentation";

export const PARTY_CATEGORY_COLORS: Readonly<Record<PartyIdeologyCategory, string>> = {
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

/** 대분류는 화면 텍스트가 아니라 색상·법률 판정 같은 내부 로직에만 쓴다. */
export function getPartyDisplayColor(
  party: CountryPartyPresentation,
  index = 0,
): string {
  void index;
  return PARTY_CATEGORY_COLORS[party.ideologyCategory];
}
