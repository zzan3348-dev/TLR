export const WORLD_TIME_REQUEST_STATES = ["ADVANCE", "HOLD"] as const;
export const WORLD_TIME_HOLD_REASONS = [
  "DIPLOMACY_NEGOTIATION",
  "MILITARY_OPERATION",
  "EVENT_RESPONSE",
  "DOMESTIC_POLICY",
  "OTHER",
] as const;

export function validSituationLevel(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function safeDetail(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}
