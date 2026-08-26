import { useMemo, type ReactNode } from "react";
import { RemoteEventEffectExecutor } from "./eventEffectsClient";
import { eventTestSandboxEngine } from "./sandboxEffectEngine";
import { EventEffectExecutorContext } from "./useEventEffectExecutor";

export function EventEffectProvider({ children }: { children: ReactNode }) {
  const executor = useMemo(
    () => window.location.pathname === "/event-test"
      ? eventTestSandboxEngine
      : new RemoteEventEffectExecutor(),
    [],
  );
  return (
    <EventEffectExecutorContext.Provider value={executor}>
      {children}
    </EventEffectExecutorContext.Provider>
  );
}
