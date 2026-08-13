import type { Conflict } from "./types";

const ACTIVE_WAR_STATUSES = new Set<Conflict["status"]>([
  "DECLARED",
  "ACTIVE",
]);

function isActiveWarRole(role: string): boolean {
  return role === "BELLIGERENT" || role === "CO_BELLIGERENT";
}

export function resolveHostileCountryKeys(
  conflicts: readonly Conflict[],
  selectedCountryKey: string,
): Set<string> {
  const hostileCountryKeys = new Set<string>();

  for (const conflict of conflicts) {
    if (!ACTIVE_WAR_STATUSES.has(conflict.status)) continue;
    const sides = conflict.sides ?? [];
    const selectedSide = sides.find((side) =>
      (side.participants ?? []).some(
        (participant) =>
          participant.country_key === selectedCountryKey &&
          participant.left_world_date === null &&
          isActiveWarRole(participant.role),
      ),
    );
    if (!selectedSide) continue;

    for (const side of sides) {
      if (side.id === selectedSide.id) continue;
      for (const participant of side.participants ?? []) {
        if (
          participant.country_key &&
          participant.left_world_date === null &&
          isActiveWarRole(participant.role)
        ) {
          hostileCountryKeys.add(participant.country_key);
        }
      }
    }
  }

  return hostileCountryKeys;
}

export async function fetchHostileCountryKeys(
  selectedCountryKey: string,
  signal: AbortSignal,
): Promise<Set<string>> {
  const response = await fetch("/api/military/conflicts", {
    credentials: "include",
    signal,
  });
  if (!response.ok) return new Set();
  const conflicts = (await response.json()) as Conflict[];
  return resolveHostileCountryKeys(conflicts, selectedCountryKey);
}
