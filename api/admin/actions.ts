import type { ApiRequest, ApiResponse } from "../../server/types.js";
import { getAdminClient, getServerEnv } from "../../server/auth.js";
import { requireAdminSession } from "../../server/adminAuth.js";
import researchAdmin from "../../server/routes/admin/research.js";
import mapCapitalsAdmin from "../../server/routes/admin/mapCapitals.js";
import provinceRegionsAdmin from "../../server/routes/admin/provinceRegions.js";
import intelligenceAdmin from "../../server/routes/admin/intelligence.js";
import worldControlAdmin from "../../server/routes/admin/worldControl.js";
import siteStatusAdmin from "../../server/routes/admin/siteStatus.js";
import countryApplicationsAdmin from "../../server/routes/admin/countryApplications.js";
import { expelCountryAssignment } from "../../server/countryApplications.js";

const actionKinds = new Set([
  "REVOKE_COUNTRY_OWNERSHIP",
  "DENY_COUNTRY_ACCESS",
  "SUSPEND_ALL_PLAY",
  "BLOCK_ACCOUNT",
]);

type ActionBody = {
  action?: unknown;
  targetUserId?: unknown;
  targetCountryKey?: unknown;
  reason?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  targetDiscordUsername?: unknown;
};

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const rawDomain = request.query?.domain;
  const domain = Array.isArray(rawDomain) ? rawDomain[0] : rawDomain;
  if (domain === "research") {
    await researchAdmin(request, response);
    return;
  }
  if (domain === "map-capitals") {
    await mapCapitalsAdmin(request, response);
    return;
  }
  if (domain === "province-regions") {
    await provinceRegionsAdmin(request, response);
    return;
  }
  if (domain === "intelligence") {
    await intelligenceAdmin(request, response);
    return;
  }
  if (domain === "world-control") {
    await worldControlAdmin(request, response);
    return;
  }
  if (domain === "site-status") {
    await siteStatusAdmin(request, response);
    return;
  }
  if (domain === "country-applications") {
    await countryApplicationsAdmin(request, response);
    return;
  }
  if (request.method !== "POST") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const session = requireAdminSession(request, response);
  if (!session) return;
  const body = (request.body ?? {}) as ActionBody;
  const action = typeof body.action === "string" ? body.action : "";
  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : null;
  const targetCountryKey = typeof body.targetCountryKey === "string" ? body.targetCountryKey : null;
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 1000) : "";
  if (action === "REGISTER_DISCORD_ADMIN") {
    const username = typeof body.targetDiscordUsername === "string" ? body.targetDiscordUsername.trim().slice(0, 80) : "";
    if (!username || !reason.trim()) return void response.status(400).json({ error: "INVALID_ADMIN_REGISTRATION" });
    const env = getServerEnv();
    if (!env) return void response.status(503).json({ error: "SERVER_NOT_CONFIGURED" });
    const admin = getAdminClient(env);
    const profiles = await admin.from("profiles").select("id,discord_username").ilike("discord_username", username).limit(2).returns<Array<{ id: string; discord_username: string | null }>>();
    if (profiles.error) return void response.status(503).json({ error: "PROFILE_LOOKUP_FAILED" });
    if (!profiles.data?.length) return void response.status(404).json({ error: "PROFILE_NOT_FOUND" });
    if (profiles.data.length !== 1) return void response.status(409).json({ error: "PROFILE_AMBIGUOUS" });
    const profile = profiles.data[0];
    const registered = await admin.from("navi_admin_members").upsert({ profile_id: profile.id, role: "admin", active: true, granted_by: session.sub, updated_at: new Date().toISOString() }, { onConflict: "profile_id" });
    if (registered.error) return void response.status(503).json({ error: "ADMIN_REGISTRATION_FAILED" });
    response.status(200).json({ ok: true, action, profileId: profile.id, discordUsername: profile.discord_username });
    return;
  }
  if (action === "EXPEL_COUNTRY_USER") {
    if (!targetUserId || !targetCountryKey || !reason.trim()) {
      response.status(400).json({ error: "INVALID_EXPULSION" });
      return;
    }
    const env = getServerEnv();
    if (!env) {
      response.status(503).json({ error: "SERVER_NOT_CONFIGURED" });
      return;
    }
    const admin = getAdminClient(env);
    try {
      const result = await expelCountryAssignment(request, admin, {
        countryKey: targetCountryKey,
        userId: targetUserId,
        reason,
      });
      const { error: logError } = await admin.from("admin_action_logs").insert({
        admin_user_id: session.sub,
        admin_kind: session.kind,
        target_user_id: targetUserId,
        target_country_key: targetCountryKey,
        action_kind: "REVOKE_COUNTRY_OWNERSHIP",
        reason: reason.trim(),
        starts_at: new Date().toISOString(),
        ends_at: null,
      });
      response.status(200).json({ ok: true, recorded: !logError, action, ...result });
    } catch (error) {
      const code = error instanceof Error ? error.message : "COUNTRY_EXPULSION_FAILED";
      response.status(code === "ACTIVE_ASSIGNMENT_NOT_FOUND" ? 409 : 503).json({ error: code });
    }
    return;
  }
  if (!actionKinds.has(action) || !reason || (!targetUserId && !targetCountryKey && action !== "SUSPEND_ALL_PLAY")) {
    response.status(400).json({ error: "INVALID_ACTION" });
    return;
  }

  const env = getServerEnv();
  let recorded = false;
  if (env) {
    const admin = getAdminClient(env);
    const { error } = await admin.from("admin_action_logs").insert({
      admin_user_id: session.sub,
      admin_kind: session.kind,
      target_user_id: targetUserId,
      target_country_key: targetCountryKey,
      action_kind: action,
      reason,
      starts_at: typeof body.startsAt === "string" ? body.startsAt : new Date().toISOString(),
      ends_at: typeof body.endsAt === "string" ? body.endsAt : null,
    });
    recorded = !error;
  }
  response.status(200).json({ ok: true, recorded, action });
}
