import type { MapMode } from "../../types/faction";

export type WorldTimeRequestState = "NONE" | "ADVANCE" | "HOLD";
export type WorldTimeHoldReason =
  | "DIPLOMACY_NEGOTIATION"
  | "MILITARY_OPERATION"
  | "EVENT_RESPONSE"
  | "DOMESTIC_POLICY"
  | "OTHER";

export type WorldSchedule = {
  id: string;
  kind: "RESEARCH" | "INTELLIGENCE";
  title: string;
  dueWorldDate: string;
};

export type WorldControlOverview = {
  worldDate: string;
  situationLevel: number;
  situationReason: string | null;
  situationChangedWorldDate: string | null;
  request: {
    state: WorldTimeRequestState;
    holdReason: WorldTimeHoldReason | null;
    details: string | null;
    requestedWorldDate: string | null;
    updatedAt: string | null;
  };
  schedules: WorldSchedule[];
};

export type WorldControlAdminRequest = {
  countryKey: string;
  state: Exclude<WorldTimeRequestState, "NONE">;
  holdReason: WorldTimeHoldReason | null;
  details: string | null;
  requestedWorldDate: string;
  updatedAt: string;
};

export type WorldControlAdminData = {
  worldDate: string;
  situationLevel: number;
  situationReason: string | null;
  situationChangedWorldDate: string | null;
  counts: { advance: number; hold: number; none: number };
  requests: WorldControlAdminRequest[];
  noRequestCountryKeys: string[];
  turn: {
    configured: boolean;
    id: string | null;
    number: number | null;
    startWorldDate: string | null;
    endWorldDate: string | null;
    status: "PLANNED" | "ACTIVE" | "SETTLED" | null;
  };
};

export type WorldTimeAdvancePreview = {
  preview: true;
  currentWorldDate: string;
  targetWorldDate: string;
  currentTurnNumber: number | null;
  resultingTurnNumber: number | null;
  crossedTurnBoundaries: Array<{ id: string; turnNumber: number; endWorldDate: string }>;
  dateBasedProcesses: readonly string[];
  turnBasedProcesses: readonly string[];
};

export const WORLD_MAP_MODES: ReadonlyArray<{
  mode: Extract<MapMode, "army" | "navy" | "air">;
  label: string;
  icon: string;
}> = [
  { mode: "army", label: "육군 지도", icon: "worldControl/army-map" },
  { mode: "navy", label: "해군 지도", icon: "worldControl/navy-map" },
  { mode: "air", label: "공군 지도", icon: "worldControl/air-map" },
];

export const HOLD_REASON_LABELS: Record<WorldTimeHoldReason, string> = {
  DIPLOMACY_NEGOTIATION: "외교 협상 진행 중",
  MILITARY_OPERATION: "군사 작전 준비 중",
  EVENT_RESPONSE: "사건 대응 검토 중",
  DOMESTIC_POLICY: "국내 정책 조정 중",
  OTHER: "기타 사유",
};

export const SITUATION_LABELS: Record<number, string> = {
  5: "안정",
  4: "경계",
  3: "불안",
  2: "위기",
  1: "파국",
};
