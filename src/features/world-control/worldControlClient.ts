import { supabase } from "../../lib/supabaseClient";
import type { WorldControlOverview, WorldTimeHoldReason } from "./types";

async function requestHeaders(countryKey: string): Promise<HeadersInit> {
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

async function worldRequest<T>(countryKey: string, init?: RequestInit): Promise<T> {
  const response = await fetch("/api/world-control/overview", {
    ...init,
    headers: { ...(await requestHeaders(countryKey)), ...init?.headers },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "WORLD_CONTROL_REQUEST_FAILED");
  return payload as T;
}

export function loadWorldControl(countryKey: string, signal?: AbortSignal): Promise<WorldControlOverview> {
  return worldRequest<unknown>(countryKey, { signal }).then(parseWorldControlOverview);
}

export function submitWorldTimeRequest(
  countryKey: string,
  action: "ADVANCE" | "HOLD" | "CANCEL",
  holdReason?: WorldTimeHoldReason,
  details?: string,
): Promise<WorldControlOverview> {
  return worldRequest<unknown>(countryKey, {
    method: "POST",
    body: JSON.stringify({ action, holdReason, details }),
  }).then(parseWorldControlOverview);
}

function parseWorldControlOverview(payload: unknown): WorldControlOverview {
  if (!payload || typeof payload !== "object") throw new Error("WORLD_CONTROL_RESPONSE_INVALID");
  const row = payload as Partial<WorldControlOverview>;
  if (
    typeof row.worldDate !== "string"
    || typeof row.situationLevel !== "number"
    || !row.request
    || !["NONE", "ADVANCE", "HOLD"].includes(row.request.state)
    || !Array.isArray(row.schedules)
  ) throw new Error("WORLD_CONTROL_RESPONSE_INVALID");
  return row as WorldControlOverview;
}
