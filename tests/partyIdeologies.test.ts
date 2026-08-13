import { describe, expect, it } from "vitest";
import countryParties from "../src/data/countryParties.json";
import {
  PARTY_IDEOLOGY_CATEGORIES,
  isPartyIdeologyCategory,
  isPartySubIdeology,
} from "../src/data/partyIdeologies";

describe("party ideology taxonomy", () => {
  it("contains exactly the twelve shared top-level categories", () => {
    expect(PARTY_IDEOLOGY_CATEGORIES).toHaveLength(12);
    expect(new Set(PARTY_IDEOLOGY_CATEGORIES).size).toBe(12);
  });

  it("keeps every imported party inside the shared taxonomy", () => {
    for (const country of Object.values(countryParties)) {
      expect(isPartyIdeologyCategory(country.ideologyCategory)).toBe(true);
      expect(
        isPartySubIdeology(
          country.ideologyCategory as (typeof PARTY_IDEOLOGY_CATEGORIES)[number],
          country.subIdeology,
        ),
      ).toBe(true);

      expect(
        country.parties.reduce((sum, party) => sum + party.support, 0),
      ).toBe(100);

      for (const party of country.parties) {
        expect(isPartyIdeologyCategory(party.ideologyCategory)).toBe(true);
        expect(
          isPartySubIdeology(
            party.ideologyCategory as (typeof PARTY_IDEOLOGY_CATEGORIES)[number],
            party.subIdeology,
          ),
        ).toBe(true);
      }
    }
  });
});
