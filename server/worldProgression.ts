import type { AdminClient } from "./auth.js";

export type TurnDefinition = {
  id: string;
  turnNumber: number;
  startWorldDate: string;
  endWorldDate: string | null;
  status: "PLANNED" | "ACTIVE" | "SETTLED";
};

export type WorldProgressionPreview = {
  currentWorldDate: string;
  targetWorldDate: string;
  currentTurnId: string | null;
  nextTurnId: string | null;
  crossedTurnBoundaries: TurnDefinition[];
};

export function planWorldProgression(
  currentWorldDate: string,
  targetWorldDate: string,
  currentTurnId: string | null,
  schedule: readonly TurnDefinition[],
): WorldProgressionPreview {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(currentWorldDate) || !/^\d{4}-\d{2}-\d{2}$/u.test(targetWorldDate) || targetWorldDate < currentWorldDate) {
    throw new Error("INVALID_WORLD_DATE_RANGE");
  }
  const crossedTurnBoundaries = schedule
    .filter((turn) => turn.endWorldDate && turn.endWorldDate >= currentWorldDate && turn.endWorldDate <= targetWorldDate)
    .slice()
    .sort((left, right) => String(left.endWorldDate).localeCompare(String(right.endWorldDate)) || left.turnNumber - right.turnNumber);
  const next = crossedTurnBoundaries.length
    ? schedule.find((turn) => turn.turnNumber === crossedTurnBoundaries[crossedTurnBoundaries.length - 1].turnNumber + 1) ?? null
    : null;
  return { currentWorldDate, targetWorldDate, currentTurnId, nextTurnId: next?.id ?? currentTurnId, crossedTurnBoundaries };
}

export async function currentTurnNumber(admin: AdminClient): Promise<number> {
  const result = await admin.from("world_state").select("current_turn_id").eq("singleton", true).single<{ current_turn_id: number | null }>();
  if (!result.error && result.data?.current_turn_id != null) {
    const turn = await admin.from("turn_definitions").select("turn_number").eq("id", result.data.current_turn_id).single<{ turn_number: number }>();
    if (!turn.error && turn.data) return Math.max(1, Number(turn.data.turn_number));
  }
  // 기존 운영 DB가 분리 마이그레이션 전인 경우 날짜에서 턴을 추정하지 않는다.
  return 1;
}
