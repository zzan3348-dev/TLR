import { supabase } from "../../lib/supabaseClient";
import type { DecisionOverview } from "./data/commonDecisions";
import type { ColonialDecisionOverview } from "./data/colonialDecisions";

export type DecisionApiOverview = DecisionOverview | ColonialDecisionOverview;

export function isColonialDecisionOverview(value: DecisionApiOverview): value is ColonialDecisionOverview {
  return "mode" in value && value.mode === "colonial";
}

export class DecisionApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

async function decisionHeaders(countryKey: string): Promise<HeadersInit> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (import.meta.env.DEV && import.meta.env.VITE_DIPLOMACY_DEV_TOKEN) {
    headers["x-tlr-dev-token"] = import.meta.env.VITE_DIPLOMACY_DEV_TOKEN as string;
    headers["x-tlr-dev-country"] = countryKey;
  }
  return headers;
}

async function request(path: string, countryKey: string, init?: RequestInit): Promise<DecisionApiOverview> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { ...(await decisionHeaders(countryKey)), ...init?.headers } });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "DECISION_REQUEST_FAILED";
    throw new DecisionApiError(code, response.status);
  }
  return payload as DecisionApiOverview;
}

export const loadDecisions = (countryKey: string, signal?: AbortSignal) => request("/api/decisions/current", countryKey, { signal });
export const executeDecision = (countryKey: string, decisionId: string, targetPartyId?: string) => request("/api/decisions/execute", countryKey, { method: "POST", body: JSON.stringify({ decisionId, targetPartyId }) });
