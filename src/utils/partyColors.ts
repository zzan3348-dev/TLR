import type { CountryPartyPresentation } from "../types/countryPresentation";

const MONARCHY_PATTERN =
  /왕정|왕실|황실|황제|군주|제국|귀족|왕당|royal|monarch|imperial|aristocrat/iu;
const CONSERVATIVE_PATTERN =
  /보수|우파|우익|질서|전통|국민|민족|자유보수|기독|가톨릭|conserv|right|national|christian/iu;
const PROGRESSIVE_PATTERN =
  /진보|좌파|좌익|사회|공산|노동|농민|생디칼|코뮌|마르크스|혁명|아나키|social|commun|labor|labour|progress|syndical|marx|anarch/iu;

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
  const text = `${party.name} ${party.ideology}`;
  if (MONARCHY_PATTERN.test(text)) {
    return "monarchy";
  }
  if (CONSERVATIVE_PATTERN.test(text)) {
    return "conservative";
  }
  if (PROGRESSIVE_PATTERN.test(text)) {
    return "progressive";
  }
  return "other";
}

export function getPartyDisplayColor(
  party: CountryPartyPresentation,
  index: number,
): string {
  const palette = PARTY_PALETTES[classifyParty(party)];
  return palette[index % palette.length];
}
