/// <reference types="node" />
import { timingSafeEqual } from "node:crypto";
import type { ApiRequest, ApiResponse } from "./types.js";
import { getAdminClient, getServerEnv, type AdminClient } from "./auth.js";
import { requireSiteOpen } from "./siteStatus.js";

export type NaviActor = {
  profileId: string;
  discordUserId: string;
  countryKey: string;
};

export type NaviAdminActor = {
  profileId: string;
  discordUserId: string;
  role: "admin" | "superadmin";
};

function header(request: ApiRequest, name: string): string | null {
  const value = request.headers[name] ?? request.headers[name.toLowerCase()];
  return (Array.isArray(value) ? value[0] : value)?.trim() || null;
}

function equalSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireNaviService(
  request: ApiRequest,
  response: ApiResponse,
): { discordUserId: string | null } | null {
  const expected = process.env.TLR_NAVI_SERVICE_TOKEN;
  if (!expected || expected.length < 32) {
    response.status(503).json({ error: "NAVI_SERVICE_NOT_CONFIGURED" });
    return null;
  }
  const authorization = header(request, "authorization");
  const provided = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!provided || !equalSecret(provided, expected)) {
    response.status(401).json({ error: "INVALID_NAVI_SERVICE_CREDENTIAL" });
    return null;
  }
  const discordUserId = header(request, "x-discord-user-id");
  if (discordUserId !== null && !/^\d{15,22}$/u.test(discordUserId)) {
    response.status(400).json({ error: "INVALID_DISCORD_USER_ID" });
    return null;
  }
  return { discordUserId };
}

export function requireNaviAdminClient(
  request: ApiRequest,
  response: ApiResponse,
): AdminClient | null {
  if (!requireNaviService(request, response)) return null;
  const env = getServerEnv();
  if (!env) {
    response.status(503).json({ error: "NAVI_SERVER_NOT_CONFIGURED" });
    return null;
  }
  return getAdminClient(env);
}

export async function requireNaviActor(
  request: ApiRequest,
  response: ApiResponse,
  admin: AdminClient,
): Promise<NaviActor | null> {
  const service = requireNaviService(request, response);
  if (!service) return null;
  if (!service.discordUserId) {
    response.status(400).json({ error: "DISCORD_USER_ID_REQUIRED" });
    return null;
  }
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,discord_user_id,access_status")
    .eq("discord_user_id", service.discordUserId)
    .maybeSingle<{ id: string; discord_user_id: string; access_status: string }>();
  if (profileError) {
    response.status(503).json({ error: "PROFILE_STATE_UNAVAILABLE" });
    return null;
  }
  if (!profile) {
    response.status(404).json({ error: "TLR_PROFILE_NOT_LINKED" });
    return null;
  }
  if (profile.access_status !== "active") {
    response.status(403).json({ error: "PLAY_ACCESS_BLOCKED", accessStatus: profile.access_status });
    return null;
  }
  if (!await requireSiteOpen(admin, response)) return null;
  const { data: ownership, error: ownershipError } = await admin
    .from("country_ownerships")
    .select("country_key,status")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .maybeSingle<{ country_key: string; status: string }>();
  if (ownershipError) {
    response.status(503).json({ error: "OWNERSHIP_STATE_UNAVAILABLE" });
    return null;
  }
  if (!ownership) {
    response.status(404).json({ error: "COUNTRY_OWNERSHIP_REQUIRED" });
    return null;
  }
  return {
    profileId: profile.id,
    discordUserId: profile.discord_user_id,
    countryKey: ownership.country_key,
  };
}

export async function requireNaviAdminActor(
  request: ApiRequest,
  response: ApiResponse,
  admin: AdminClient,
): Promise<NaviAdminActor | null> {
  const service = requireNaviService(request, response);
  if (!service) return null;
  if (!service.discordUserId) {
    response.status(400).json({ error: "DISCORD_USER_ID_REQUIRED" });
    return null;
  }
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,discord_user_id,access_status")
    .eq("discord_user_id", service.discordUserId)
    .maybeSingle<{ id: string; discord_user_id: string; access_status: string }>();
  if (profileError) {
    response.status(503).json({ error: "PROFILE_STATE_UNAVAILABLE" });
    return null;
  }
  if (!profile) {
    response.status(404).json({ error: "TLR_PROFILE_NOT_LINKED" });
    return null;
  }
  if (profile.access_status !== "active") {
    response.status(403).json({ error: "PLAY_ACCESS_BLOCKED", accessStatus: profile.access_status });
    return null;
  }
  const { data: member, error } = await admin
    .from("navi_admin_members")
    .select("role,active")
    .eq("profile_id", profile.id)
    .eq("active", true)
    .maybeSingle<{ role: "admin" | "superadmin"; active: boolean }>();
  if (error) {
    response.status(503).json({ error: "NAVI_ADMIN_STATE_UNAVAILABLE" });
    return null;
  }
  if (!member) {
    response.status(403).json({ error: "TLR_ADMIN_PERMISSION_REQUIRED" });
    return null;
  }
  return {
    profileId: profile.id,
    discordUserId: profile.discord_user_id,
    role: member.role,
  };
}
