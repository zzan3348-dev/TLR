import { supabase } from "../../lib/supabaseClient";
import { readPlayCountryKey } from "../play/playSession";
import type {
  EventChoiceExecution,
  EventChoiceExecutionResult,
  EventEffectExecutor,
} from "./types";

async function requestHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (import.meta.env.DEV && import.meta.env.VITE_DIPLOMACY_DEV_TOKEN) {
    headers["x-tlr-dev-token"] = import.meta.env.VITE_DIPLOMACY_DEV_TOKEN as string;
    headers["x-tlr-dev-country"] = readPlayCountryKey() ?? "country-013";
  }
  return headers;
}

export class RemoteEventEffectExecutor implements EventEffectExecutor {
  async execute(execution: EventChoiceExecution): Promise<EventChoiceExecutionResult> {
    const response = await fetch("/api/events/choices", {
      method: "POST",
      credentials: "include",
      headers: await requestHeaders(),
      body: JSON.stringify({
        eventId: execution.eventId,
        eventInstanceId: execution.eventInstanceId,
        choiceId: execution.choiceId,
      }),
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "EVENT_EFFECT_REQUEST_FAILED";
      throw new Error(code);
    }
    window.dispatchEvent(new CustomEvent("tlr:event-effects-applied", { detail: payload }));
    return payload as EventChoiceExecutionResult;
  }
}
