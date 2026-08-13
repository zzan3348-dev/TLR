import type { CountryPartyPresentation } from "../types/countryPresentation";

const PARTY_PALETTES = {
  monarchy: [
    "#343941",
    "#57545a",
    "#74685b",
    "#454c50",
    "#292d34",
  ],
  conservative: [
    "#18365f",
    "#28537d",
    "#3f6687",
    "#293e70",
    "#172944",
  ],
  progressive: [
    "#78233b",
    "#9b3834",
    "#a83f5c",
    "#5d2443",
    "#8b2b22",
  ],
  other: [
    "#386466",
    "#6b5840",
    "#605274",
    "#486052",
    "#756a3e",
  ],
} as const;

function classifyParty(
  party: CountryPartyPresentation,
): keyof typeof PARTY_PALETTES {
  if (
    party.ideologyCategory === "군주주의" ||
    party.ideologyCategory === "반동주의"
  ) {
    return "monarchy";
  }
  if (
    party.ideologyCategory === "보수주의" ||
    party.ideologyCategory === "권위주의" ||
    party.ideologyCategory === "국가재생주의"
  ) {
    return "conservative";
  }
  if (
    party.ideologyCategory === "전위사회주의" ||
    party.ideologyCategory === "평의회사회주의" ||
    party.ideologyCategory === "생디칼리슴" ||
    party.ideologyCategory === "자유사회주의" ||
    party.ideologyCategory === "사회민주주의" ||
    party.ideologyCategory === "급진공화주의"
  ) {
    return "progressive";
  }
  return "other";
}

export function getPartyDisplayColor(
  party: CountryPartyPresentation,
  index: number,
): string {
  if (party.color) {
    return party.color;
  }
  const palette = PARTY_PALETTES[classifyParty(party)];
  return palette[index % palette.length];
}
