import { supabase } from "../../lib/supabaseClient";
import type { IntelligenceOverview } from "./types";

export class IntelligenceApiError extends Error { constructor(public code: string, public status: number) { super(code); } }
async function headers(countryKey: string): Promise<HeadersInit> {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  const session = await supabase?.auth.getSession(); const token = session?.data.session?.access_token;
  if (token) result.Authorization = `Bearer ${token}`;
  if (import.meta.env.DEV && import.meta.env.VITE_DIPLOMACY_DEV_TOKEN) { result["x-tlr-dev-token"] = import.meta.env.VITE_DIPLOMACY_DEV_TOKEN as string; result["x-tlr-dev-country"] = countryKey; }
  return result;
}
async function request<T>(countryKey: string, route: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/intelligence/${route}`, { ...init, headers: { ...(await headers(countryKey)), ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new IntelligenceApiError(payload.error ?? "INTELLIGENCE_REQUEST_FAILED", response.status);
  return payload as T;
}
export async function loadIntelligence(countryKey: string, signal?: AbortSignal): Promise<IntelligenceOverview> {
  const payload = await request<IntelligenceOverview>(countryKey, "overview", { signal });
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.upgrades) || !Array.isArray(payload.networks) || !Array.isArray(payload.operations)) throw new IntelligenceApiError("INTELLIGENCE_RESPONSE_INVALID", 502);
  return payload;
}
export const intelligenceAction = (countryKey: string, body: Record<string, unknown>) => request<{ ok: true; id?: string }>(countryKey, "actions", { method: "POST", body: JSON.stringify(body) });
