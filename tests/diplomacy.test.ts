import { describe, expect, it } from "vitest";
import {
  cleanCountryKey,
  cleanDate,
  cleanTerms,
  databaseErrorCode,
  proposalType,
} from "../server/diplomacy";
import { withParticle } from "../src/utils/koreanParticle";
import { DiplomacyApiError, parseDiplomacyOverview } from "../src/features/diplomacy/diplomacyClient";

describe("diplomacy input validation", () => {
  it("accepts only stable country keys", () => {
    expect(cleanCountryKey("country-013")).toBe("country-013");
    expect(cleanCountryKey("country-13")).toBeNull();
    expect(cleanCountryKey("country-013,receiver_country_key.eq.country-008")).toBeNull();
  });

  it("accepts only supported proposal types and ISO world dates", () => {
    expect(proposalType("TRADE_AGREEMENT")).toBe("TRADE_AGREEMENT");
    expect(proposalType("AUTO_ACCEPT")).toBeNull();
    expect(cleanDate("1932-07-28")).toBe("1932-07-28");
    expect(cleanDate("28/07/1932")).toBeNull();
  });

  it("normalizes proposal terms and caps their field count", () => {
    expect(cleanTerms(null)).toEqual({});
    expect(cleanTerms(["invalid"])).toEqual({});
    const entries = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`field${index}`, index]));
    expect(Object.keys(cleanTerms(entries))).toHaveLength(20);
  });

  it("does not leak unknown database messages", () => {
    expect(databaseErrorCode(new Error("PROPOSAL_NOT_PENDING"))).toBe("PROPOSAL_NOT_PENDING");
    expect(databaseErrorCode(new Error("password=secret"))).toBe("DATABASE_ERROR");
  });
});

describe("Korean diplomatic copy", () => {
  it("selects particles from the final consonant", () => {
    expect(withParticle("독일", "이", "가")).toBe("독일이");
    expect(withParticle("프랑스", "이", "가")).toBe("프랑스가");
  });
});

describe("diplomacy response validation", () => {
  it("rejects an unrelated JSON response instead of crashing the workspace", () => {
    expect(() => parseDiplomacyOverview({ html: "fallback" })).toThrowError(DiplomacyApiError);
  });

  it("accepts the required overview shape", () => {
    const relation = { available: true, baseScore: 0, score: 0, modifiers: [] };
    expect(parseDiplomacyOverview({
      actorCountryKey: "country-001",
      targetCountryKey: "country-002",
      worldDate: "1932-01-01",
      targetReviewRoute: "ADMIN",
      relations: { outgoing: relation, incoming: relation },
      actions: {},
      proposals: [],
      agreements: [],
      history: [],
    }).targetReviewRoute).toBe("ADMIN");
  });
});
