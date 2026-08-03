import { supabase } from "../../lib/supabaseClient";
import type { EconomySnapshot, TradeAgreement, TradeCountrySummary, TradeLine, TradeNotification, TradeProposal } from "./types";

export class EconomyApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

async function headers(countryKey: string): Promise<HeadersInit> {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (token) result.Authorization = `Bearer ${token}`;
  if (import.meta.env.DEV && import.meta.env.VITE_DIPLOMACY_DEV_TOKEN) {
    result["x-tlr-dev-token"] = import.meta.env.VITE_DIPLOMACY_DEV_TOKEN as string;
    result["x-tlr-dev-country"] = countryKey;
  }
  return result;
}

async function requestJson<T>(path: string, countryKey: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { ...(await headers(countryKey)), ...init?.headers } });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "ECONOMY_REQUEST_FAILED";
    throw new EconomyApiError(code, response.status);
  }
  return payload as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireRecord(value: unknown, code: string): Record<string, unknown> {
  if (!isRecord(value)) throw new EconomyApiError(code, 502);
  return value;
}

function requireArrayProperty<T>(value: unknown, key: string, code: string): T[] {
  const record = requireRecord(value, code);
  if (!Array.isArray(record[key])) throw new EconomyApiError(code, 502);
  return record[key] as T[];
}

export const loadEconomy = async (countryKey: string, signal?: AbortSignal): Promise<EconomySnapshot> => {
  const payload = requireRecord(await requestJson<unknown>("/api/economy/current", countryKey, { signal }), "INVALID_ECONOMY_RESPONSE");
  if (typeof payload.readiness !== "string" || !isRecord(payload.rules) || !Array.isArray(payload.resources)) {
    throw new EconomyApiError("INVALID_ECONOMY_RESPONSE", 502);
  }
  return payload as unknown as EconomySnapshot;
};
export const saveBudget = (countryKey: string, budget: Record<string, number>) => requestJson("/api/economy/budget", countryKey, { method: "POST", body: JSON.stringify({ action: "SAVE_DRAFT", budget }) });
export const confirmBudget = (countryKey: string) => requestJson("/api/economy/budget", countryKey, { method: "POST", body: JSON.stringify({ action: "CONFIRM" }) });
export const loadTradeCountries = async (countryKey: string, signal?: AbortSignal) => {
  const payload = await requestJson<unknown>("/api/trade/countries", countryKey, { signal });
  return { worldDate: String(requireRecord(payload, "INVALID_TRADE_RESPONSE").worldDate ?? ""), countries: requireArrayProperty<TradeCountrySummary>(payload, "countries", "INVALID_TRADE_RESPONSE") };
};
export const loadTradeProposals = async (countryKey: string, signal?: AbortSignal) => {
  const payload = await requestJson<unknown>("/api/trade/proposals", countryKey, { signal });
  return { worldDate: String(requireRecord(payload, "INVALID_TRADE_RESPONSE").worldDate ?? ""), proposals: requireArrayProperty<TradeProposal>(payload, "proposals", "INVALID_TRADE_RESPONSE") };
};
export const loadTradeAgreements = async (countryKey: string, signal?: AbortSignal) => {
  const payload = await requestJson<unknown>("/api/trade/agreements", countryKey, { signal });
  return { worldDate: String(requireRecord(payload, "INVALID_TRADE_RESPONSE").worldDate ?? ""), agreements: requireArrayProperty<TradeAgreement>(payload, "agreements", "INVALID_TRADE_RESPONSE") };
};
export const createTradeProposal = (countryKey: string, payload: {
  targetCountryKey: string;
  lines: TradeLine[];
  startWorldDate: string;
  endWorldDate: string;
  responseDeadlineWorldDate: string;
  settlementIntervalDays: number;
  autoRenew?: boolean;
  allowEarlyTermination?: boolean;
  allowPartialFulfillment?: boolean;
  idempotencyKey?: string;
}) => requestJson("/api/trade/proposals", countryKey, { method: "POST", body: JSON.stringify(payload) });
export const respondTradeProposal = (countryKey: string, proposalId: string, action: "ACCEPT" | "REJECT" | "WITHDRAW") => requestJson("/api/trade/proposals", countryKey, { method: "PATCH", body: JSON.stringify({ proposalId, action }) });
export const terminateTradeAgreement = (countryKey: string, agreementId: string) => requestJson("/api/trade/agreements", countryKey, { method: "PATCH", body: JSON.stringify({ agreementId, action: "TERMINATE" }) });
export const loadTradeNotifications = async (countryKey: string, signal?: AbortSignal) => {
  const payload = await requestJson<unknown>("/api/trade/notifications", countryKey, { signal });
  return { notifications: requireArrayProperty<TradeNotification>(payload, "notifications", "INVALID_TRADE_RESPONSE") };
};
export const updateTradeNotification = (countryKey: string, notificationId: string, action: "READ" | "DISMISS") => requestJson("/api/trade/notifications", countryKey, { method: "PATCH", body: JSON.stringify({ notificationId, action }) });
export function announceEconomyUpdate(): void { window.dispatchEvent(new CustomEvent("tlr:economy-updated")); }
