import type { ApiRequest, ApiResponse } from "../../types.js";
import { requireNaviAdminClient, requireNaviService } from "../../naviAuth.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const service = requireNaviService(request, response);
  if (!service) return;
  const admin = requireNaviAdminClient(response);
  if (!admin) return;
  const rawAfter = request.query?.after;
  const afterText = Array.isArray(rawAfter) ? rawAfter[0] : rawAfter;
  const rawLatest = request.query?.latest;
  const latest = (Array.isArray(rawLatest) ? rawLatest[0] : rawLatest) === "true";
  const after = Number(afterText ?? "0");
  if (!Number.isSafeInteger(after) || after < 0) {
    response.status(400).json({ error: "INVALID_EVENT_CURSOR" });
    return;
  }
  if (latest) {
    const { data, error } = await admin
      .from("research_audit_logs")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);
    if (error) {
      response.status(503).json({ error: "NAVI_EVENTS_UNAVAILABLE" });
      return;
    }
    response.status(200).json({ events: [], nextCursor: data?.[0]?.id ?? 0 });
    return;
  }
  const { data, error } = await admin
    .from("research_audit_logs")
    .select("id,project_id,country_key,action,details,world_date,created_at")
    .gt("id", after)
    .order("id")
    .limit(100);
  if (error) {
    response.status(503).json({ error: "NAVI_EVENTS_UNAVAILABLE" });
    return;
  }
  const countryKeys = [...new Set((data ?? []).map((event) => event.country_key).filter(Boolean))];
  const ownerships = countryKeys.length
    ? await admin
      .from("country_ownerships")
      .select("country_key,user_id")
      .in("country_key", countryKeys)
      .eq("status", "active")
    : { data: [], error: null };
  if (ownerships.error) {
    response.status(503).json({ error: "NAVI_EVENTS_UNAVAILABLE" });
    return;
  }
  const profileIds = (ownerships.data ?? []).map((row) => row.user_id);
  const profiles = profileIds.length
    ? await admin.from("profiles").select("id,discord_user_id").in("id", profileIds)
    : { data: [], error: null };
  if (profiles.error) {
    response.status(503).json({ error: "NAVI_EVENTS_UNAVAILABLE" });
    return;
  }
  const discordByProfile = new Map((profiles.data ?? []).map((profile) => [profile.id, profile.discord_user_id]));
  const ownerByCountry = new Map((ownerships.data ?? []).map((ownership) => [
    ownership.country_key,
    discordByProfile.get(ownership.user_id) ?? null,
  ]));
  response.status(200).json({
    events: (data ?? []).map((event) => ({
      ...event,
      discordUserId: event.country_key ? ownerByCountry.get(event.country_key) ?? null : null,
    })),
    nextCursor: data?.length ? data[data.length - 1].id : after,
  });
}
