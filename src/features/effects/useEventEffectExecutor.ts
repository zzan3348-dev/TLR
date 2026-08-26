import { createContext, useContext } from "react";
import type { EventEffectExecutor } from "./types";

export const EventEffectExecutorContext = createContext<EventEffectExecutor | null>(null);

export function useEventEffectExecutor(): EventEffectExecutor {
  const executor = useContext(EventEffectExecutorContext);
  if (!executor) throw new Error("useEventEffectExecutor must be used inside EventEffectProvider");
  return executor;
}
