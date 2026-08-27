import type { Conflict, MilitaryMapState, MilitaryNotification, MilitaryOverview, OfficerCorpsState, OfficerSpiritCategory } from "./types";

export class MilitaryApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "MilitaryApiError";
  }
}

async function militaryRequest<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/military/${route}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw new MilitaryApiError(payload.error ?? "MILITARY_REQUEST_FAILED", response.status);
  }
  return payload;
}

export function fetchMilitaryOverview(countryKey: string): Promise<MilitaryOverview> {
  return militaryRequest<MilitaryOverview>(`overview?country_key=${encodeURIComponent(countryKey)}`);
}

export function fetchMilitaryMapState(): Promise<MilitaryMapState> {
  return militaryRequest<MilitaryMapState>("map-state");
}

export function fetchWarDeclarations(): Promise<MilitaryNotification[]> {
  return militaryRequest<MilitaryNotification[]>("notifications");
}

export function acknowledgeMilitaryNotification(id: string): Promise<{ ok: true }> {
  return militaryRequest<{ ok: true }>("notifications", { method: "PATCH", body: JSON.stringify({ id }) });
}

export function fetchMilitaryConflicts(): Promise<Conflict[]> {
  return militaryRequest<Conflict[]>("conflicts");
}

export function fetchOfficerCorps(countryKey: string): Promise<OfficerCorpsState> {
  return militaryRequest<OfficerCorpsState>(`officer-corps?country_key=${encodeURIComponent(countryKey)}`);
}

export function selectOfficerSpirit(
  category: OfficerSpiritCategory,
  spiritId: string,
  expectedVersion: number,
): Promise<OfficerCorpsState> {
  return militaryRequest<OfficerCorpsState>("officer-corps", {
    method: "POST",
    body: JSON.stringify({ category, spiritId, expectedVersion }),
  });
}

export function selectGrandDoctrine(doctrineId: string, expectedVersion: number): Promise<OfficerCorpsState> {
  return militaryRequest<OfficerCorpsState>("officer-corps", {
    method: "POST",
    body: JSON.stringify({ doctrineId, expectedVersion }),
  });
}

export function militaryMutation<T>(route: string, body: Record<string, unknown>, method = "POST"): Promise<T> {
  return militaryRequest<T>(route, {
    method,
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}
