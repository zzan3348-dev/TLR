import type { ApiRequest, ApiResponse } from "./types.js";
import type { AdminClient } from "./auth.js";
import { requireDiplomacyActor, currentWorldDate } from "./diplomacy.js";

export const requireResearchActor = requireDiplomacyActor;

export async function researchWorldDate(admin: AdminClient): Promise<string> {
  const worldDate = await currentWorldDate(admin);
  await admin.rpc("tlr_advance_research", { p_world_date: worldDate });
  return worldDate;
}

export function researchDatabaseError(error: unknown): string {
  const message = error instanceof Error ? error.message : error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return [
    "RESEARCH_PROJECT_NOT_FOUND", "RESEARCH_PROJECT_NOT_REVIEWABLE", "RESEARCH_PROJECT_NOT_ACTIVE",
    "INSUFFICIENT_RESEARCH_POINTS",
  ].find((code) => message.includes(code)) ?? "RESEARCH_DATA_UNAVAILABLE";
}

export function cleanPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function requireProjectOwner(
  request: ApiRequest, response: ApiResponse, admin: AdminClient, projectId: string,
) {
  const actor = await requireResearchActor(request, response, admin);
  if (!actor) return null;
  const { data, error } = await admin.from("research_projects").select("id,country_key,status,total_investment,scheduled_completion_world_date").eq("id", projectId).maybeSingle();
  if (error) { response.status(503).json({ error: "RESEARCH_DATA_UNAVAILABLE" }); return null; }
  if (!data || data.country_key !== actor.countryKey) { response.status(404).json({ error: "RESEARCH_PROJECT_NOT_FOUND" }); return null; }
  return { actor, project: data as { id: string; country_key: string; status: string; total_investment: number; scheduled_completion_world_date: string } };
}
