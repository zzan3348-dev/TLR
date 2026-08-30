import type { ApiRequest, ApiResponse } from "../../server/types.js";
import {
  collectRequestSignals,
  discordProviderId,
  getAdminClient,
  getAuthenticatedUser,
  getServerEnv,
} from "../../server/auth.js";
import { submitCountryApplication } from "../../server/countryApplications.js";
import { loadSiteStatus } from "../../server/siteStatus.js";
import { ensurePersistentSession } from "../../server/persistentSession.js";

type ProfileRow = {
  id: string;
  discord_user_id: string;
  discord_username: string | null;
  discord_avatar_url: string | null;
  access_status: "active" | "review" | "blocked";
  blocked_reason: string | null;
  blocked_at: string | null;
};

type DeviceMatchRow = {
  user_id: string;
  device_install_hash: string | null;
  ip_hash: string | null;
  asn: string | null;
};

type OwnershipRow = {
  country_key: string;
  user_id: string;
  status: "active" | "revoked";
};

function requestedCountryKey(request: ApiRequest): string | null {
  if (request.method !== "POST" || !request.body || typeof request.body !== "object") return null;
  const body = request.body as { action?: unknown; countryKey?: unknown };
  return body.action === "APPLY_COUNTRY"
    && typeof body.countryKey === "string"
    && /^country-\d{3}$/u.test(body.countryKey)
    ? body.countryKey
    : null;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const env = getServerEnv();
  if (!env) {
    response.status(503).json({ error: "AUTH_SERVER_NOT_CONFIGURED" });
    return;
  }
  const admin = getAdminClient(env);
  const user = await getAuthenticatedUser(request, admin);
  if (!user) {
    response.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }
  const providerId = discordProviderId(user);
  if (!providerId) {
    response.status(400).json({ error: "DISCORD_ID_NOT_FOUND" });
    return;
  }

  const signals = await collectRequestSignals(request, env);
  const persistentCookie = ensurePersistentSession(request, user.id);
  const cookies = [signals.setCookie, persistentCookie].filter((cookie): cookie is string => Boolean(cookie));
  if (cookies.length) response.setHeader("Set-Cookie", cookies);

  const username = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null;
  const avatarUrl = typeof user.user_metadata?.avatar_url === "string"
    ? user.user_metadata.avatar_url
    : null;

  const existing = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle<ProfileRow>();
  if (existing.error) {
    response.status(500).json({ error: "PROFILE_LOOKUP_FAILED" });
    return;
  }
  let profile = existing.data;

  if (!profile) {
    const { data: linkedProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("discord_user_id", providerId)
      .neq("id", user.id)
      .maybeSingle<{ id: string }>();
    if (linkedProfile) {
      response.status(409).json({ error: "DISCORD_ID_ALREADY_LINKED" });
      return;
    }
    const { data: match } = await admin
      .from("auth_devices")
      .select("user_id, device_install_hash, ip_hash, asn")
      .eq("device_install_hash", signals.deviceHash)
      .eq("ip_hash", signals.ipHash)
      .eq("asn", signals.asn)
      .neq("user_id", user.id)
      .limit(1)
      .maybeSingle<DeviceMatchRow>();
    const { data: relatedSignals } = await admin
      .from("auth_devices")
      .select("user_id, device_install_hash, ip_hash, asn")
      .neq("user_id", user.id)
      .or(`device_install_hash.eq.${signals.deviceHash},ip_hash.eq.${signals.ipHash},asn.eq.${signals.asn}`)
      .limit(20)
      .returns<DeviceMatchRow[]>();
    const shouldBlock = Boolean(match?.user_id && signals.deviceHash && signals.ipHash && signals.asn);
    const hasReviewSignal = Boolean(
      !shouldBlock && relatedSignals?.some((row) =>
        row.device_install_hash === signals.deviceHash ||
        (signals.ipHash !== null && row.ip_hash === signals.ipHash) ||
        (signals.asn !== null && row.asn === signals.asn),
      ),
    );
    const accessStatus = shouldBlock ? "blocked" : hasReviewSignal ? "review" : "active";
    const blockedReason = shouldBlock
      ? "MULTI_ACCOUNT_TRIPLE_MATCH"
      : hasReviewSignal
        ? "MULTI_ACCOUNT_REVIEW_SIGNAL"
        : null;
    const { data: created, error: createError } = await admin
      .from("profiles")
      .upsert({
        id: user.id,
        discord_user_id: providerId,
        discord_username: username,
        discord_avatar_url: avatarUrl,
        access_status: accessStatus,
        blocked_reason: blockedReason,
        blocked_at: shouldBlock ? new Date().toISOString() : null,
      }, { onConflict: "id" })
      .select("*")
      .single<ProfileRow>();
    if (createError || !created) {
      response.status(500).json({ error: "PROFILE_CREATE_FAILED" });
      return;
    }
    profile = created;
    if (shouldBlock && match?.user_id) {
      await admin.from("access_blocks").insert({
        user_id: user.id,
        matched_user_id: match.user_id,
        block_code: "MULTI_ACCOUNT_TRIPLE_MATCH",
      });
    }
  } else {
    await admin.from("profiles").update({
      discord_user_id: providerId,
      discord_username: username,
      discord_avatar_url: avatarUrl,
    }).eq("id", user.id);
  }

  const { data: activeOwnership, error: ownershipLookupError } = await admin
    .from("country_ownerships")
    .select("country_key, user_id, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle<OwnershipRow>();
  if (ownershipLookupError) {
    response.status(503).json({ error: "OWNERSHIP_STATE_UNAVAILABLE" });
    return;
  }

  const ownershipCountryKey = activeOwnership?.country_key ?? null;
  if (request.method === "POST") {
    const countryKey = requestedCountryKey(request);
    if (!countryKey) {
      response.status(400).json({ error: "INVALID_COUNTRY_APPLICATION" });
      return;
    }
    if (profile.access_status !== "active") {
      response.status(403).json({ error: "PLAY_ACCESS_BLOCKED", accessStatus: profile.access_status });
      return;
    }
    try {
      await submitCountryApplication(request, admin, {
        countryKey,
        userId: user.id,
        discordUserId: profile.discord_user_id,
      });
    } catch (applicationError) {
      const applicationCode = applicationError instanceof Error ? applicationError.message : "UNKNOWN";
      console.error("country application failed", {
        countryKey,
        userId: user.id,
        code: applicationError instanceof Error ? applicationError.message.slice(0, 220) : "UNKNOWN",
      });
      if (applicationCode === "COUNTRY_ALREADY_ASSIGNED" || applicationCode === "COUNTRY_ALREADY_CLAIMED") {
        response.status(409).json({ error: applicationCode, countryKey: ownershipCountryKey });
        return;
      }
      response.status(503).json({ error: "COUNTRY_APPLICATION_FAILED" });
      return;
    }
  }

  let siteStatus;
  try {
    siteStatus = await loadSiteStatus(admin);
  } catch {
    response.status(503).json({ error: "SITE_STATUS_UNAVAILABLE" });
    return;
  }
  type StoredApplication = { id: string; country_key: string; status: string; created_at: string; notified_at: string | null };
  let application: StoredApplication | null = null;
  if (ownershipCountryKey) {
    const { data: storedApplication, error: applicationLookupError } = await admin
      .from("country_applications")
      .select("id,country_key,status,created_at,notified_at")
      .eq("user_id", user.id)
      .eq("country_key", ownershipCountryKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<StoredApplication>();
    application = applicationLookupError
      ? {
          id: `legacy-${user.id}`,
          country_key: ownershipCountryKey,
          status: "pending",
          created_at: "",
          notified_at: null,
        }
      : storedApplication;
  }

  await admin.from("auth_devices").upsert({
    user_id: user.id,
    device_install_hash: signals.deviceHash,
    ip_hash: signals.ipHash,
    asn: signals.asn,
    network_name: signals.networkName,
    network_type: signals.networkType,
    country_code: signals.countryCode,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "user_id,device_install_hash" });
  await admin.from("auth_networks").upsert({
    user_id: user.id,
    ip_hash: signals.ipHash,
    asn: signals.asn,
    network_name: signals.networkName,
    network_type: signals.networkType,
    mobile: null,
    country_code: signals.countryCode,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "user_id,ip_hash,asn" });
  await admin.from("auth_login_logs").insert({
    user_id: user.id,
    outcome: profile.access_status === "blocked" ? "blocked" : profile.access_status === "review" ? "review" : "allowed",
    reason: profile.blocked_reason,
    device_install_hash: signals.deviceHash,
    ip_hash: signals.ipHash,
    asn: signals.asn,
  });

  response.status(200).json({ profile, ownershipCountryKey, siteStatus, application });
}
