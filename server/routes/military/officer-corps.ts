import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { cleanUuid, countryFromQuery, OFFICER_CATEGORIES, officerCorpsState, requireMilitaryActor, type OfficerCategory } from "../../military.js";
import { currentWorldDate } from "../../diplomacy.js";

type Body = { category?: unknown; spiritId?: unknown; doctrineId?: unknown; expectedVersion?: unknown };

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv();
  if (!env) { response.status(503).json({ error: "MILITARY_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  if (request.method === "GET") {
    const countryKey = countryFromQuery(request);
    if (!countryKey) { response.status(400).json({ error: "COUNTRY_REQUIRED" }); return; }
    try { response.status(200).json(await officerCorpsState(admin, countryKey)); }
    catch (error) { console.error("officer corps read failed", error); response.status(503).json({ error: "OFFICER_CORPS_UNAVAILABLE" }); }
    return;
  }

  const actor = await requireMilitaryActor(request, response, admin);
  if (!actor) return;
  const body = (request.body ?? {}) as Body;
  const expectedVersion = Number(body.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) { response.status(400).json({ error: "VERSION_REQUIRED" }); return; }
  try {
    const state = await officerCorpsState(admin, actor.countryKey);
    if (state.version !== expectedVersion) { response.status(409).json({ error: "STALE_OFFICER_CORPS_STATE", state }); return; }
    const worldDate = await currentWorldDate(admin);
    const existing = await admin.from("country_officer_corps").select("*").eq("country_key", actor.countryKey).maybeSingle();
    if (existing.error) throw existing.error;
    const changedBy = actor.userId ?? "development";

    if (body.doctrineId !== undefined) {
      const doctrineId = cleanUuid(body.doctrineId);
      const option = state.doctrines.find((row) => row.id === doctrineId);
      if (!option || option.selectionState !== "READY") { response.status(409).json({ error: "DOCTRINE_NOT_SELECTABLE", state }); return; }
      const payload = { grand_doctrine_id: option.id, version: expectedVersion + 1, updated_by: changedBy, updated_at: new Date().toISOString() };
      const mutation = existing.data
        ? await admin.from("country_officer_corps").update(payload).eq("country_key", actor.countryKey).eq("version", expectedVersion).select("version").maybeSingle()
        : await admin.from("country_officer_corps").insert({ country_key: actor.countryKey, ...payload }).select("version").maybeSingle();
      if (mutation.error || !mutation.data) { response.status(409).json({ error: "STALE_OFFICER_CORPS_STATE" }); return; }
      await admin.from("country_grand_doctrine_history").insert({ country_key: actor.countryKey, previous_doctrine_id: existing.data?.grand_doctrine_id ?? null, selected_doctrine_id: option.id, changed_by: changedBy, world_date: worldDate });
    } else {
      const category = typeof body.category === "string" && OFFICER_CATEGORIES.includes(body.category as OfficerCategory) ? body.category as OfficerCategory : null;
      const spiritId = cleanUuid(body.spiritId);
      const option = state.spirits.find((row) => row.id === spiritId && row.category === category);
      if (!category || !option || option.selectionState !== "READY") { response.status(409).json({ error: "OFFICER_SPIRIT_NOT_SELECTABLE", state }); return; }
      const column = category === "ACADEMY" ? "academy_spirit_id" : category === "ARMY" ? "army_spirit_id" : "division_command_spirit_id";
      const payload = { [column]: option.id, version: expectedVersion + 1, updated_by: changedBy, updated_at: new Date().toISOString() };
      const mutation = existing.data
        ? await admin.from("country_officer_corps").update(payload).eq("country_key", actor.countryKey).eq("version", expectedVersion).select("version").maybeSingle()
        : await admin.from("country_officer_corps").insert({ country_key: actor.countryKey, ...payload }).select("version").maybeSingle();
      if (mutation.error || !mutation.data) { response.status(409).json({ error: "STALE_OFFICER_CORPS_STATE" }); return; }
      await admin.from("country_officer_spirit_history").insert({ country_key: actor.countryKey, category, previous_spirit_id: existing.data?.[column] ?? null, selected_spirit_id: option.id, changed_by: changedBy, world_date: worldDate });
    }
    response.status(200).json(await officerCorpsState(admin, actor.countryKey));
  } catch (error) {
    console.error("officer corps update failed", error);
    response.status(503).json({ error: "OFFICER_CORPS_UPDATE_FAILED" });
  }
}
