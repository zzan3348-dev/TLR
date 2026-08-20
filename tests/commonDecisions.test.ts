import { describe, expect, it } from "vitest";
import { COMMON_DECISIONS } from "../src/features/decisions/data/commonDecisions";
import { worldTurn } from "../server/decisions";

describe("공통 결정 정의", () => {
  it("확정된 14개 결정만 제공한다", () => {
    expect(COMMON_DECISIONS).toHaveLength(14);
    expect(new Set(COMMON_DECISIONS.map((decision) => decision.id)).size).toBe(14);
  });

  it("확정 수치와 3턴 임시 효과를 보존한다", () => {
    const mobilization = COMMON_DECISIONS.find((decision) => decision.id === "total_mobilization_propaganda");
    expect(mobilization).toMatchObject({ politicalPowerCost: 150, durationTurns: 3, cooldownTurns: 5 });
    expect(mobilization?.effects).toContain("3턴 동안 가용 인력 +10%");
  });

  it("세계 날짜를 30일 단위 턴으로 환산한다", () => {
    expect(worldTurn("1932-01-01")).toBe(0);
    expect(worldTurn("1932-01-31")).toBe(1);
  });
});
