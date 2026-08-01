import type { Faction } from "../types/faction";

export const NON_ALIGNED_COLOR = "#62676B";

export const factions = [
  {
    id: "european_peoples_federation",
    name: "유럽인민연방",
    englishName: "European Federation of Peoples",
    color: "#9E2B32",
    mapLabelCount: 2,
    mapLabelPaths: [
      {
        start: { x: 2840, y: 540 },
        control: { x: 3240, y: 410 },
        end: { x: 3660, y: 330 },
        fontSize: 78,
      },
      {
        start: { x: 2610, y: 980 },
        control: { x: 2835, y: 895 },
        end: { x: 3070, y: 920 },
        fontSize: 38,
        letterSpacing: 0.28,
      },
    ],
  },
  {
    id: "triple_alliance",
    name: "삼국동맹",
    englishName: "Triple Alliance",
    color: "#AA7939",
    mapLabelCount: 3,
  },
  {
    id: "triple_entente",
    name: "삼국협상",
    englishName: "Triple Entente",
    color: "#665487",
    mapLabelCount: 3,
  },
  {
    id: "oceanic_compact",
    name: "대양협약",
    englishName: "Oceanic Compact",
    color: "#35698C",
    mapLabelCount: 4,
  },
  {
    id: "african_sovereignty_congress",
    name: "아프리카 자주회의",
    englishName: "African Sovereignty Congress",
    color: "#497957",
    mapLabelCount: 3,
    mapLabelPaths: [
      {
        start: { x: 2548, y: 1125 },
        control: { x: 2705, y: 1060 },
        end: { x: 2900, y: 1120 },
        fontSize: 37,
        letterSpacing: 0.18,
      },
      {
        start: { x: 3325, y: 1275 },
        control: { x: 3460, y: 1215 },
        end: { x: 3595, y: 1275 },
        fontSize: 29,
        letterSpacing: 0.2,
      },
      {
        start: { x: 3115, y: 1655 },
        control: { x: 3245, y: 1595 },
        end: { x: 3370, y: 1650 },
        fontSize: 29,
        letterSpacing: 0.2,
      },
    ],
  },
  {
    id: "white_accord",
    name: "백색협약",
    englishName: "White Accord",
    color: "#B9B8AE",
    mapLabelCount: 1,
  },
  {
    id: "preservation_accord",
    name: "보전협약",
    englishName: "Preservation Accord",
    color: "#9A5436",
    mapLabelCount: 2,
    mapLabelPaths: [
      {
        start: { x: 950, y: 535 },
        control: { x: 1265, y: 620 },
        end: { x: 1580, y: 555 },
        fontSize: 82,
        letterSpacing: 0.42,
      },
      {
        start: { x: 1645, y: 1860 },
        control: { x: 1795, y: 1790 },
        end: { x: 1915, y: 1650 },
        fontSize: 40,
        letterSpacing: 0.3,
      },
    ],
  },
] as const satisfies readonly Faction[];

const factionsById = new Map<string, Faction>(
  factions.map((faction) => [faction.id, faction]),
);

export function getFaction(factionId: string): Faction | null {
  return factionsById.get(factionId) ?? null;
}
