import { createContext, useContext } from "react";
import type { SuperEventData } from "./types";

export type SuperEventQueueContextValue = {
  activeEvent: SuperEventData | null;
  queuedCount: number;
  enqueueSuperEvent: (event: SuperEventData) => void;
};

export const SuperEventQueueContext = createContext<SuperEventQueueContextValue | null>(null);

export function useSuperEventQueue(): SuperEventQueueContextValue {
  const context = useContext(SuperEventQueueContext);
  if (!context) throw new Error("useSuperEventQueue must be used inside SuperEventQueueProvider");
  return context;
}
