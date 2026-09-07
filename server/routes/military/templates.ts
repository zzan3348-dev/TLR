import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { cleanUuid, requireMilitaryActor } from "../../military.js";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!["GET", "POST", "PATCH"].includes(request.method ?? "")) { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv(); if (!env) { response.status(503).json({ error: "MILITARY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  const actor = await requireMilitaryActor(request, response, admin); if (!actor) return;
  const catalog = await admin.from("military_battalion_definitions").select("*").eq("active", true).order("display_name");
  if (catalog.error) { response.status(503).json({ error: "BATTALIONS_UNAVAILABLE" }); return; }
  if (request.method === "GET") { response.status(200).json(catalog.data); return; }
  const body = request.body as Record<string, unknown> | null;
  const name = typeof body?.display_name === "string" ? body.display_name.trim() : "";
  const line = body?.battalion_slots, support = body?.support_slots;
  if (!name || name.length > 80 || !Array.isArray(line) || line.length !== 25 || !Array.isArray(support) || support.length !== 5) { response.status(400).json({ error: "INVALID_TEMPLATE" }); return; }
  const byId = new Map((catalog.data ?? []).map((row) => [row.id, row]));
  if ([...line, ...support].some((id) => id !== null && (typeof id !== "string" || !byId.has(id))) || line.some((id) => id !== null && byId.get(id)?.category !== "LINE") || support.some((id) => id !== null && byId.get(id)?.category !== "SUPPORT")) { response.status(400).json({ error: "INVALID_BATTALION" }); return; }
  // Store the layout without inventing formation time or cost rules. Existing authorized
  // totals remain untouched on edits; new layouts require approved template totals.
  const patch = { display_name: name, battalion_slots: line, support_slots: support, configuration_status: "PARTIAL", updated_at: new Date().toISOString() };
  if (request.method === "POST") {
    const result = await admin.from("military_templates").insert({ ...patch, country_key: actor.countryKey, force_kind: "LAND_UNIT" }).select("*").single();
    response.status(result.error ? 503 : 201).json(result.error ? { error: "TEMPLATE_SAVE_FAILED" } : result.data); return;
  }
  const id = cleanUuid(body?.id); const version = Number(body?.expected_version);
  if (!id || !Number.isInteger(version) || version < 1) { response.status(400).json({ error: "TEMPLATE_VERSION_REQUIRED" }); return; }
  const result = await admin.from("military_templates").update({ ...patch, version: version + 1 }).eq("id", id).eq("country_key", actor.countryKey).eq("force_kind", "LAND_UNIT").eq("configuration_status", "PARTIAL").eq("version", version).select("*").maybeSingle();
  response.status(result.error ? 503 : result.data ? 200 : 409).json(result.error ? { error: "TEMPLATE_SAVE_FAILED" } : result.data ?? { error: "TEMPLATE_CONFLICT" });
}
