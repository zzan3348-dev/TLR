import rawTaxonomy from "./partyIdeologyTaxonomy.json";

export const PARTY_IDEOLOGY_CATEGORIES = [
  "전위사회주의",
  "평의회사회주의",
  "생디칼리슴",
  "자유사회주의",
  "사회민주주의",
  "급진공화주의",
  "자유주의",
  "보수주의",
  "권위주의",
  "군주주의",
  "반동주의",
  "국가재생주의",
] as const;

export type PartyIdeologyCategory =
  (typeof PARTY_IDEOLOGY_CATEGORIES)[number];

export type PartyIdeologyTaxonomy = Readonly<
  Record<PartyIdeologyCategory, readonly string[]>
>;

export const PARTY_IDEOLOGY_TAXONOMY =
  rawTaxonomy as PartyIdeologyTaxonomy;

const categorySet = new Set<string>(PARTY_IDEOLOGY_CATEGORIES);

export function isPartyIdeologyCategory(
  value: string,
): value is PartyIdeologyCategory {
  return categorySet.has(value);
}

export function isPartySubIdeology(
  category: PartyIdeologyCategory,
  value: string,
): boolean {
  return PARTY_IDEOLOGY_TAXONOMY[category].includes(value);
}

export function formatPartyIdeology(
  category: PartyIdeologyCategory,
  subIdeology: string,
): string {
  return subIdeology ? `${category} · ${subIdeology}` : category;
}
