import { describe, expect, it } from "vitest";
import { HOLD_REASON_LABELS, SITUATION_LABELS, WORLD_MAP_MODES } from "../src/features/world-control/types";
import { safeDetail, validSituationLevel, WORLD_TIME_HOLD_REASONS } from "../server/worldControl";

describe("세계시간 HUD 공통 규칙", () => {
  it("세계상황은 안정 5단계부터 파국 1단계까지 완전하게 정의한다", () => {
    expect([5, 4, 3, 2, 1].map((level) => SITUATION_LABELS[level])).toEqual(["안정", "경계", "불안", "위기", "파국"]);
    expect([0, 1, 5, 6].map(validSituationLevel)).toEqual([false, true, true, false]);
  });

  it("보류 사유와 군종 지도 모드는 중복 없이 고정한다", () => {
    expect(Object.keys(HOLD_REASON_LABELS)).toEqual([...WORLD_TIME_HOLD_REASONS]);
    expect(WORLD_MAP_MODES.map(({ mode }) => mode)).toEqual(["army", "navy", "air"]);
  });

  it("관리자와 플레이어의 자유 입력을 정규화하고 제한한다", () => {
    expect(safeDetail("  외교 협상 대기  ")).toBe("외교 협상 대기");
    expect(safeDetail("   ")).toBeNull();
    expect(safeDetail("가".repeat(700))?.length).toBe(500);
  });
});
