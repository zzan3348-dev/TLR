import { describe, expect, it } from "vitest";
import {
  cleanBudget,
  cleanPositiveNumber,
  cleanTradeAsset,
  cleanTradeLines,
  cleanTradeResource,
  economyDatabaseError,
} from "../server/economy";

describe("economy input validation", () => {
  it("accepts only the five configured resource types", () => {
    expect(cleanTradeResource("STEEL")).toBe("STEEL");
    expect(cleanTradeResource("URANIUM")).toBeNull();
    expect(cleanTradeAsset("PRODUCTION_CAPACITY")).toBe("PRODUCTION_CAPACITY");
  });

  it("never coerces missing values to zero", () => {
    expect(cleanPositiveNumber(null)).toBeNull();
    expect(cleanPositiveNumber(0)).toBeNull();
    expect(cleanPositiveNumber(2.5)).toBe(2.5);
  });

  it("validates integer budget drafts", () => {
    expect(cleanBudget({ welfare: 25, military: 40 })).toEqual({ welfare: 25, military: 40 });
    expect(cleanBudget({ welfare: 25.5 })).toBeNull();
    expect(cleanBudget({ "invalid key": 20 })).toBeNull();
  });
});

describe("bilateral trade validation", () => {
  const proposer = "country-001";
  const receiver = "country-002";

  it("requires value to move in both directions", () => {
    expect(cleanTradeLines([
      { fromCountryKey: proposer, toCountryKey: receiver, assetType: "RESOURCE", resourceTypeId: "STEEL", amount: 5 },
      { fromCountryKey: receiver, toCountryKey: proposer, assetType: "PRODUCTION_CAPACITY", resourceTypeId: null, amount: 2 },
    ], proposer, receiver)).toHaveLength(2);
    expect(cleanTradeLines([
      { fromCountryKey: proposer, toCountryKey: receiver, assetType: "RESOURCE", resourceTypeId: "STEEL", amount: 5 },
      { fromCountryKey: proposer, toCountryKey: receiver, assetType: "RESOURCE", resourceTypeId: "OIL", amount: 2 },
    ], proposer, receiver)).toBeNull();
  });

  it("rejects unrelated countries and mismatched resource fields", () => {
    expect(cleanTradeLines([
      { fromCountryKey: "country-003", toCountryKey: receiver, assetType: "RESOURCE", resourceTypeId: "STEEL", amount: 5 },
      { fromCountryKey: receiver, toCountryKey: proposer, assetType: "PRODUCTION_CAPACITY", resourceTypeId: null, amount: 2 },
    ], proposer, receiver)).toBeNull();
  });

  it("does not leak database details", () => {
    expect(economyDatabaseError(new Error("TRADE_ASSET_INSUFFICIENT"))).toBe("TRADE_ASSET_INSUFFICIENT");
    expect(economyDatabaseError(new Error("password=secret"))).toBe("DATABASE_ERROR");
  });
});
