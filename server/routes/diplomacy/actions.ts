import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { cleanCountryKey, currentWorldDate, databaseErrorCode, requireDiplomacyActor } from "../../diplomacy.js";

const actionTypes = new Set(["IMPROVE_RELATIONS", "WORSEN_RELATIONS", "DECLARE_WAR"]);

type ConflictParticipant = { conflict_id: string; country_key: string | null };
type ConflictRow = { id: string; status: string };
type CreatedConflict = { id: string };
type CreatedSide = { id: string };

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "POST") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const env = getServerEnv();
  if (!env) {
    response.status(503).json({ error: "DIPLOMACY_SERVER_NOT_CONFIGURED" });
    return;
  }
  const admin = getAdminClient(env);
  const actor = await requireDiplomacyActor(request, response, admin);
  if (!actor) return;
  const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
  const target = cleanCountryKey(body.targetCountryKey);
  const actionType = typeof body.actionType === "string" ? body.actionType : "";
  if (!target || !actionTypes.has(actionType)) {
    response.status(400).json({ error: "INVALID_ACTION" });
    return;
  }
  if (target === actor.countryKey) {
    response.status(400).json({ error: "SELF_TARGET" });
    return;
  }
  try {
    const worldDate = await currentWorldDate(admin);
    if (actionType === "DECLARE_WAR") {
      const participants = await admin
        .from("military_conflict_participants")
        .select("conflict_id, country_key")
        .in("country_key", [actor.countryKey, target])
        .is("left_world_date", null)
        .returns<ConflictParticipant[]>();
      if (participants.error) throw participants.error;
      const countriesByConflict = new Map<string, Set<string>>();
      for (const participant of participants.data ?? []) {
        if (!participant.country_key) continue;
        const countries = countriesByConflict.get(participant.conflict_id) ?? new Set<string>();
        countries.add(participant.country_key);
        countriesByConflict.set(participant.conflict_id, countries);
      }
      const sharedConflictIds = [...countriesByConflict.entries()]
        .filter(([, countries]) => countries.has(actor.countryKey) && countries.has(target))
        .map(([conflictId]) => conflictId);
      if (sharedConflictIds.length > 0) {
        const active = await admin
          .from("military_conflicts")
          .select("id, status")
          .in("id", sharedConflictIds)
          .not("status", "in", "(ENDED,CANCELLED)")
          .returns<ConflictRow[]>();
        if (active.error) throw active.error;
        if ((active.data ?? []).length > 0) {
          response.status(409).json({ error: "WAR_ALREADY_ACTIVE" });
          return;
        }
      }

      const conflictResult = await admin
        .from("military_conflicts")
        .insert({
          display_name: `${actor.countryKey}–${target} 전쟁`,
          conflict_type: "INTERSTATE_WAR",
          status: "DECLARED",
          tags: ["PLAYER_DECLARATION"],
          declared_world_date: worldDate,
          started_world_date: worldDate,
        })
        .select("id")
        .single<CreatedConflict>();
      if (conflictResult.error || !conflictResult.data) throw conflictResult.error ?? new Error("CONFLICT_CREATE_FAILED");
      const conflictId = conflictResult.data.id;
      try {
        const sideResult = await admin
          .from("military_conflict_sides")
          .insert([
            { conflict_id: conflictId, display_name: actor.countryKey, sort_order: 0 },
            { conflict_id: conflictId, display_name: target, sort_order: 1 },
          ])
          .select("id")
          .returns<CreatedSide[]>();
        if (sideResult.error || (sideResult.data ?? []).length !== 2) throw sideResult.error ?? new Error("CONFLICT_SIDE_CREATE_FAILED");
        const sides = sideResult.data ?? [];
        const participantResult = await admin.from("military_conflict_participants").insert([
          { conflict_id: conflictId, side_id: sides[0].id, country_key: actor.countryKey, role: "BELLIGERENT", joined_world_date: worldDate },
          { conflict_id: conflictId, side_id: sides[1].id, country_key: target, role: "BELLIGERENT", joined_world_date: worldDate },
        ]);
        if (participantResult.error) throw participantResult.error;
      } catch (creationError) {
        await admin.from("military_conflicts").delete().eq("id", conflictId);
        throw creationError;
      }
      response.status(201).json({ ok: true, conflictId, worldDate });
      return;
    }
    const { data, error } = await admin.rpc("tlr_apply_diplomatic_action", {
      p_source: actor.countryKey,
      p_target: target,
      p_action_type: actionType,
      p_world_date: worldDate,
    });
    if (error) throw error;
    response.status(200).json({ ok: true, score: data, worldDate });
  } catch (error) {
    const code = databaseErrorCode(error);
    response.status(code === "ACTION_COOLDOWN" ? 409 : 500).json({ error: code });
  }
}
