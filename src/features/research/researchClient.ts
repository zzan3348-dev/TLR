import type { InvestmentPreview, ResearchOverview } from "./types";

export class ResearchApiError extends Error {
  constructor(public readonly code: string) { super(code); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new ResearchApiError(payload.error ?? "RESEARCH_REQUEST_FAILED");
  return payload;
}

export function loadResearchOverview(signal?: AbortSignal): Promise<ResearchOverview> {
  return request<ResearchOverview>("/api/research/overview", { signal });
}

export function submitResearchProject(input: {
  title: string; categoryId: string; description: string; objective: string;
  prerequisites: string; initialInvestment: number;
}): Promise<{ projectId: string }> {
  return request("/api/research/projects", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
}

export function previewResearchInvestment(projectId: string, amount: number): Promise<{ preview: InvestmentPreview }> {
  return request("/api/research/investments", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "PREVIEW", projectId, amount }),
  });
}

export function confirmResearchInvestment(projectId: string, amount: number): Promise<{ ok: true }> {
  return request("/api/research/investments", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "CONFIRM", projectId, amount, idempotencyKey: crypto.randomUUID() }),
  });
}
