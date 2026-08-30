import { describe, expect, it } from "vitest";
import { lawDefinitions } from "../src/features/politics/data/lawDefinitions";
import type { CountryDevelopmentState } from "../src/features/politics/types/development";
import { evaluateLawAvailability, type LawAvailabilityContext } from "../src/features/politics/utils/lawAvailability";

const developmentState: CountryDevelopmentState = {
  countryId: "test",
  povertyRate: null,
  povertyChange: null,
  items: [
    { id: "administration", level: 3, trend: "stable" },
    { id: "industry-specialization", level: 3, trend: "stable" },
    { id: "military-professionalism", level: 3, trend: "stable" },
  ],
};

const baseContext: LawAvailabilityContext = {
  rulingIdeologyCategory: "사회민주주의",
  rulingPartyName: "사회민주당",
  rulingPartySupport: 45,
  politicalPower: 500,
  stability: 70,
  warSupport: 65,
  gdp: 100,
  atWar: false,
  selectedLawOptions: {
    "party-system": "party-system:multiparty",
    "religion-policy": "religion-policy:pluralism",
    franchise: "franchise:universal",
    "womens-rights": "womens-rights:civil",
  },
  developmentState,
};

describe("law availability", () => {
  it("imports v2 execution metadata for all 140 choices", () => {
    const options = lawDefinitions.flatMap((definition) => definition.options);
    expect(options).toHaveLength(140);
    expect(options.every((option) => Number.isFinite(option.implementationTurns))).toBe(true);
    expect(options.every((option) => Number.isFinite(option.implementationCostGdpPct))).toBe(true);
    expect(options.every((option) => Number.isFinite(option.changeCooldownTurns))).toBe(true);
  });

  it("blocks a law when political power is insufficient", () => {
    const definition = lawDefinitions.find((item) => item.id === "franchise")!;
    const option = definition.options.find((item) => item.id === "franchise:universal")!;
    const result = evaluateLawAvailability(definition, option, { ...baseContext, politicalPower: 0 }, lawDefinitions);
    expect(result.canSelect).toBe(false);
    expect(result.costs.find((item) => item.id === "political-power")?.tone).toBe("fail");
  });

  it("treats the no-exemption war rules as alternatives", () => {
    const definition = lawDefinitions.find((item) => item.id === "exemptions")!;
    const option = definition.options.find((item) => item.id === "exemptions:none")!;
    const result = evaluateLawAvailability(definition, option, baseContext, lawDefinitions);
    expect(result.requirements.find((item) => item.id === "war-or-support")?.tone).toBe("pass");
  });
});

