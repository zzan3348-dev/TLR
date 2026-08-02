import type { ApiRequest, ApiResponse } from "../../server/types";
import {
  collectRequestSignals,
  discordProviderId,
  getAdminClient,
  getAuthenticatedUser,
  getServerEnv,
} from "../../server/auth";

type ProfileRow = {
  id: string;
  discord_user_id: string;
  discord_username: string | null;
  discord_avatar_url: string | null;
  access_status: "active" | "review" | "blocked";
  blocked_reason: string | null;
  blocked_at: string | null;
};

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
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
  if (signals.setCookie) response.setHeader("Set-Cookie", signals.setCookie);

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
      .select("user_id")
      .eq("device_install_hash", signals.deviceHash)
      .eq("ip_hash", signals.ipHash)
      .eq("asn", signals.asn)
      .neq("user_id", user.id)
      .limit(1)
      .maybeSingle<{ user_id: string }>();
    const shouldBlock = Boolean(match?.user_id && signals.deviceHash && signals.ipHash && signals.asn);
    const accessStatus = shouldBlock ? "blocked" : "active";
    const blockedReason = shouldBlock ? "MULTI_ACCOUNT_TRIPLE_MATCH" : null;
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
  await admin.from("auth_login_logs").insert({
    user_id: user.id,
    outcome: profile.access_status === "blocked" ? "blocked" : "allowed",
    reason: profile.blocked_reason,
    device_install_hash: signals.deviceHash,
    ip_hash: signals.ipHash,
    asn: signals.asn,
  });

  response.status(200).json({ profile });
}
