import type { SuperEventData } from "./types";

export function appendSuperEvent(
  queue: readonly SuperEventData[],
  event: SuperEventData,
): SuperEventData[] {
  return queue.some(({ id }) => id === event.id) ? [...queue] : [...queue, event];
}

export function advanceSuperEventQueue(
  queue: readonly SuperEventData[],
): SuperEventData[] {
  return queue.slice(1);
}
