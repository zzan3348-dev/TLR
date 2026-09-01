import { describe, expect, it } from "vitest";
import { planWorldProgression, type TurnDefinition } from "../server/worldProgression";

const schedule: TurnDefinition[] = [
  { id: "turn-1", turnNumber: 1, startWorldDate: "1932-01-01", endWorldDate: "1932-01-10", status: "ACTIVE" },
  { id: "turn-2", turnNumber: 2, startWorldDate: "1932-01-11", endWorldDate: "1932-02-01", status: "PLANNED" },
  { id: "turn-3", turnNumber: 3, startWorldDate: "1932-02-02", endWorldDate: null, status: "PLANNED" },
];

describe("세계시간과 턴 경계 분리", () => {
  it("경계가 없으면 세계날짜만 바뀐다", () => {
    const preview = planWorldProgression("1932-01-01", "1932-01-05", "turn-1", schedule);
    expect(preview.crossedTurnBoundaries).toHaveLength(0);
    expect(preview.nextTurnId).toBe("turn-1");
  });

  it("한 번 또는 여러 경계를 날짜 순서대로 찾는다", () => {
    expect(planWorldProgression("1932-01-01", "1932-01-10", "turn-1", schedule).crossedTurnBoundaries.map((turn) => turn.id)).toEqual(["turn-1"]);
    expect(planWorldProgression("1932-01-01", "1932-01-15", "turn-1", schedule).crossedTurnBoundaries.map((turn) => turn.id)).toEqual(["turn-1"]);
    expect(planWorldProgression("1932-01-01", "1932-03-01", "turn-1", schedule).crossedTurnBoundaries.map((turn) => turn.id)).toEqual(["turn-1", "turn-2"]);
  });
});
