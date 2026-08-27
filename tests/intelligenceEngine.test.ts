import { describe, expect, it } from "vitest";
import { DEFAULT_INTELLIGENCE_UPGRADES, DEFAULT_SPY_OPERATIONS } from "../src/features/intelligence/data/intelligenceDefinitions";
import { canReserveAsset, confidenceForInfiltration, deterministicRoll, estimateRange, infiltrationStage, nextOperationPhase, operationScores, resolveOperationOutcome } from "../server/intelligenceEngine";

describe("intelligence definitions", () => {
  it("seeds all 20 upgrades in five categories", () => {
    expect(DEFAULT_INTELLIGENCE_UPGRADES).toHaveLength(20);
    expect(new Set(DEFAULT_INTELLIGENCE_UPGRADES.map((item) => item.category)).size).toBe(5);
    expect(DEFAULT_INTELLIGENCE_UPGRADES.every((item) => item.icon_asset_key && !/[😀-🙏]/u.test(item.icon_asset_key))).toBe(true);
  });
  it("contains all nine major operations", () => {
    expect(DEFAULT_SPY_OPERATIONS).toHaveLength(9);
    expect(DEFAULT_SPY_OPERATIONS.every((operation) => operation.operation_class === "MAJOR" && operation.admin_review_mode === "REQUIRED")).toBe(true);
  });
});

describe("intelligence network and snapshots", () => {
  it("keeps five infiltration levels independent", () => {
    const values = [9, 18, 34, 41, 62];
    expect(values.map(infiltrationStage)).toEqual(["CONTACT", "CONTACT", "LIMITED", "ESTABLISHED", "DEEP"]);
  });
  it("narrows estimates as confidence rises without exposing exact values", () => {
    expect(confidenceForInfiltration(18)).toBe("VERY_LOW");
    expect(estimateRange(84, "LOW")).toEqual({ minimum: 50, maximum: 118 });
    expect(estimateRange(84, "VERY_HIGH")).toEqual({ minimum: 80, maximum: 88 });
  });
});

describe("operation state and outcomes", () => {
  it("uses explicit preparation execution extraction and result phases", () => {
    expect(nextOperationPhase("PREPARATION")).toBe("EXECUTION"); expect(nextOperationPhase("EXECUTION")).toBe("EXTRACTION"); expect(nextOperationPhase("EXTRACTION")).toBe("RESULT"); expect(nextOperationPhase("RESULT")).toBe("RESULT");
  });
  it("scores success, detection and attribution independently and deterministically", () => {
    const scores = operationScores({ baseDifficulty: 50, baseDetectionRisk: 35, agency: 60, infiltration: 65, assetQuality: 70, upgrades: 8, counterintelligence: 55, alertness: 30, repetitions: 1, cover: 12 });
    const first = resolveOperationOutcome("operation-1932-001", scores); const second = resolveOperationOutcome("operation-1932-001", scores);
    expect(first).toEqual(second); expect(["SUCCESS", "FAILURE"]).toContain(first.success); expect(["DETECTED", "UNDETECTED"]).toContain(first.detection); expect(["UNATTRIBUTED", "SUSPECTED", "ATTRIBUTED"]).toContain(first.attribution); expect(deterministicRoll("operation-1932-001", "success")).toBeGreaterThanOrEqual(0);
  });
  it("blocks locked or already assigned assets", () => { expect(canReserveAsset("ACTIVE", [])).toBe(true); expect(canReserveAsset("LOCKED", [])).toBe(false); expect(canReserveAsset("ACTIVE", ["op-1"])).toBe(false); });
});
