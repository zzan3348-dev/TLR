import rawNationalSpirits from "../../data/generated/countryNationalSpirits.json" with { type: "json" };
import type { CountryNationalSpirit } from "../../types/countryPresentation.js";

export type NationalSpiritRegistryEntry = CountryNationalSpirit & {
  registryId: string;
  countryKey: string;
  legacyId: string;
};

const entries = Object.entries(rawNationalSpirits as Record<string, CountryNationalSpirit[]>).flatMap(
  ([countryKey, spirits]) => spirits.map((spirit) => ({
    ...spirit,
    registryId: `${countryKey}:${spirit.id}`,
    countryKey,
    legacyId: spirit.id,
  })),
);

const byRegistryId = new Map(entries.map((entry) => [entry.registryId, entry]));

export function listNationalSpiritDefinitions(): readonly NationalSpiritRegistryEntry[] {
  return entries;
}

export function resolveNationalSpiritDefinition(
  spiritId: string,
  targetCountryId?: string,
): NationalSpiritRegistryEntry | null {
  const exact = byRegistryId.get(spiritId);
  if (exact) return exact;
  if (targetCountryId) {
    return entries.find((entry) => entry.countryKey === targetCountryId && entry.legacyId === spiritId) ?? null;
  }
  const matches = entries.filter((entry) => entry.legacyId === spiritId);
  return matches.length === 1 ? matches[0] : null;
}
