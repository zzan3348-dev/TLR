import type { SuperEventData } from "./types";

export function appendSuperEvent(
  queue: readonly SuperEventData[],
  event: SuperEventData,
): SuperEventData[] {
  return queue.some(({ instanceId }) => instanceId === event.instanceId) ? [...queue] : [...queue, event];
}

export function advanceSuperEventQueue(
  queue: readonly SuperEventData[],
): SuperEventData[] {
  return queue.slice(1);
}
