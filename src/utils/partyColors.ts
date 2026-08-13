import type { PartyIdeologyCategory } from "../data/partyIdeologies";
import type { CountryPartyPresentation } from "../types/countryPresentation";

export const PARTY_CATEGORY_COLORS: Readonly<Record<PartyIdeologyCategory, string>> = {
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

/** 대분류는 화면 텍스트가 아니라 색상·법률 판정 같은 내부 로직에만 쓴다. */
export function getPartyDisplayColor(
  party: CountryPartyPresentation,
  index = 0,
): string {
  void index;
  return PARTY_CATEGORY_COLORS[party.ideologyCategory];
}
