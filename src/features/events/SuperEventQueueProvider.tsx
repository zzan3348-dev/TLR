import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SuperEventData } from "./types";
import { SuperEventTemplate } from "./components/SuperEventTemplate";
import { advanceSuperEventQueue, appendSuperEvent } from "./superEventQueue";
import { SuperEventQueueContext } from "./useSuperEventQueue";

export function SuperEventQueueProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<SuperEventData[]>([]);
  const activeEvent = queue[0] ?? null;
  const enqueueSuperEvent = useCallback((event: SuperEventData) => {
    setQueue((current) => appendSuperEvent(current, event));
  }, []);
  const finishActiveEvent = useCallback(() => {
    setQueue(advanceSuperEventQueue);
  }, []);
  const value = useMemo(() => ({
    activeEvent,
    queuedCount: Math.max(0, queue.length - 1),
    enqueueSuperEvent,
  }), [activeEvent, enqueueSuperEvent, queue.length]);

  return (
    <SuperEventQueueContext.Provider value={value}>
      {children}
      {activeEvent ? (
        <SuperEventTemplate
          key={activeEvent.instanceId}
          event={activeEvent}
          onFinished={finishActiveEvent}
        />
      ) : null}
    </SuperEventQueueContext.Provider>
  );
}
