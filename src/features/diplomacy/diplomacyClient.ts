import { supabase } from "../../lib/supabaseClient";
import type { DiplomacyNotification, DiplomacyOverview, ProposalType } from "./types";

export class DiplomacyApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
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
    const code = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "DIPLOMACY_REQUEST_FAILED";
    throw new DiplomacyApiError(code, response.status);
  }
  return payload as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDirectionalRelation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.available === "boolean"
    && (typeof value.baseScore === "number" || value.baseScore === null)
    && (typeof value.score === "number" || value.score === null)
    && Array.isArray(value.modifiers);
}

export function parseDiplomacyOverview(payload: unknown): DiplomacyOverview {
  if (!isRecord(payload)
    || typeof payload.actorCountryKey !== "string"
    || typeof payload.targetCountryKey !== "string"
    || typeof payload.worldDate !== "string"
    || (payload.targetReviewRoute !== "PLAYER" && payload.targetReviewRoute !== "ADMIN")
    || !isRecord(payload.relations)
    || !isDirectionalRelation(payload.relations.outgoing)
    || !isDirectionalRelation(payload.relations.incoming)
    || !isRecord(payload.actions)
    || !Array.isArray(payload.proposals)
    || !Array.isArray(payload.agreements)
    || !Array.isArray(payload.history)) {
    throw new DiplomacyApiError("DIPLOMACY_RESPONSE_INVALID", 502);
  }
  return payload as DiplomacyOverview;
}

export async function loadDiplomacyOverview(countryKey: string, targetCountryKey: string, signal?: AbortSignal): Promise<DiplomacyOverview> {
  const payload = await requestJson<unknown>(`/api/diplomacy/overview?targetCountryKey=${encodeURIComponent(targetCountryKey)}`, countryKey, { signal });
  return parseDiplomacyOverview(payload);
}

export function runRelationAction(countryKey: string, targetCountryKey: string, actionType: "IMPROVE_RELATIONS" | "WORSEN_RELATIONS"): Promise<{ score: number }> {
  return requestJson("/api/diplomacy/actions", countryKey, {
    method: "POST",
    body: JSON.stringify({ targetCountryKey, actionType }),
  });
}

export function createProposal(countryKey: string, payload: {
  targetCountryKey: string;
  proposalType: ProposalType;
  startsWorldDate: string;
  endsWorldDate: string | null;
  deadlineWorldDate: string;
  terms: Record<string, unknown>;
}): Promise<{ proposalId: string; reviewRoute: "PLAYER" | "ADMIN" }> {
  return requestJson("/api/diplomacy/proposals", countryKey, { method: "POST", body: JSON.stringify(payload) });
}

export function respondToProposal(countryKey: string, proposalId: string, action: "ACCEPT" | "REJECT" | "WITHDRAW"): Promise<{ status: string }> {
  return requestJson("/api/diplomacy/proposals", countryKey, {
    method: "PATCH",
    body: JSON.stringify({ proposalId, action }),
  });
}

export function loadDiplomacyNotifications(countryKey: string, signal?: AbortSignal): Promise<{
  worldDate: string;
  unreadCount: number;
  notifications: DiplomacyNotification[];
}> {
  return requestJson("/api/diplomacy/notifications", countryKey, { signal });
}

export function updateDiplomacyNotification(countryKey: string, notificationId: string, action: "READ" | "DISMISS"): Promise<{ ok: true }> {
  return requestJson("/api/diplomacy/notifications", countryKey, {
    method: "PATCH",
    body: JSON.stringify({ notificationId, action }),
  });
}

export function announceDiplomacyUpdate(): void {
  window.dispatchEvent(new CustomEvent("tlr:diplomacy-updated"));
}
