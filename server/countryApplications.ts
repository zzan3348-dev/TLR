/// <reference types="node" />
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import countryCatalog from "../src/data/mapCountries.json" with { type: "json" };
import type { AdminClient } from "./auth.js";
import type { ApiRequest } from "./types.js";

export const TLR_DISCORD_GUILD_ID = "1535589795617833021";
export const TLR_APPLICATION_CHANNEL_ID = "1543182755813138452";
const DISCORD_API = "https://discord.com/api/v10";

function applicationNonce(value: string): string {
  return BigInt(`0x${createHash("sha256").update(value).digest("hex").slice(0, 15)}`).toString(10);
}

type CatalogCountry = { key: string; name: string; flagPath?: string };
type ApplicationResult = {
  applicationId: string;
  status: string;
  duplicate: boolean;
};

type EmojiRecord = {
  emoji_id: string | null;
  emoji_name: string;
  status: "processing" | "ready" | "failed";
};

type DiscordEmoji = { id: string; name: string };

export function countryEmojiName(countryKey: string): string {
  const safe = countryKey.toLowerCase().replace(/[^a-z0-9_]/gu, "_").replace(/_+/gu, "_");
  return `tlr_${safe}`.slice(0, 32);
}

export function countryApplicationMessage(
  discordUserId: string,
  emoji: Pick<DiscordEmoji, "id" | "name">,
  countryName: string,
): string {
  return `<@${discordUserId}>님이 <:${emoji.name}:${emoji.id}> ${countryName}을 신청하셨습니다! 개장까지 잠시만 기다려주세요!`;
}

export function countryExpulsionMessage(
  discordUsername: string,
  emoji: Pick<DiscordEmoji, "id" | "name">,
  countryName: string,
  reason: string,
): string {
  const safeUsername = discordUsername.replace(/[\r\n]/gu, " ").trim();
  const safeReason = reason.replace(/[\r\n]+/gu, " ").trim();
  return `${safeUsername}님의 <:${emoji.name}:${emoji.id}>${countryName} 연재 자격을 관리자가 박탈하였습니다\n사유: ${safeReason}`;
}

function countryByKey(countryKey: string): CatalogCountry | null {
  return (countryCatalog as CatalogCountry[]).find((country) => country.key === countryKey) ?? null;
}

function discordHeaders(token: string): Record<string, string> {
  return { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
}

async function discordJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...discordHeaders(token), ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`DISCORD_HTTP_${response.status}:${detail.slice(0, 300)}`);
  }
  return await response.json() as T;
}

function requestOrigin(request: ApiRequest): string {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || "https";
  const forwardedHost = request.headers["x-forwarded-host"] ?? request.headers.host;
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  if (host) return `${proto}://${host}`;
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;
  throw new Error("PUBLIC_ORIGIN_UNAVAILABLE");
}

export function prepareDiscordEmojiPng(input: Uint8Array): string {
  const source = PNG.sync.read(Buffer.from(input));
  const size = 128;
  const output = new PNG({ width: size, height: size, colorType: 6 });
  const ratio = Math.min(size / source.width, size / source.height);
  const width = Math.max(1, Math.round(source.width * ratio));
  const height = Math.max(1, Math.round(source.height * ratio));
  const offsetX = Math.floor((size - width) / 2);
  const offsetY = Math.floor((size - height) / 2);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y / ratio));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x / ratio));
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const outputOffset = ((y + offsetY) * size + x + offsetX) * 4;
      output.data[outputOffset] = source.data[sourceOffset];
      output.data[outputOffset + 1] = source.data[sourceOffset + 1];
      output.data[outputOffset + 2] = source.data[sourceOffset + 2];
      output.data[outputOffset + 3] = source.data[sourceOffset + 3];
    }
  }
  const encoded = PNG.sync.write(output, { colorType: 6, inputColorType: 6 });
  if (encoded.byteLength > 256 * 1024) throw new Error("FLAG_EMOJI_TOO_LARGE");
  return `data:image/png;base64,${encoded.toString("base64")}`;
}

async function loadFlagData(request: ApiRequest, flagPath: string): Promise<string> {
  if (!flagPath.startsWith("/assets/")) throw new Error("FLAG_PATH_INVALID");
  const response = await fetch(new URL(flagPath, requestOrigin(request)));
  if (!response.ok) throw new Error(`FLAG_FETCH_${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("image/png")) throw new Error("FLAG_NOT_PNG");
  return prepareDiscordEmojiPng(new Uint8Array(await response.arrayBuffer()));
}

async function markEmoji(
  admin: AdminClient,
  countryKey: string,
  values: Partial<{ emoji_id: string | null; emoji_name: string; status: string; failure_code: string | null }>,
): Promise<void> {
  const { error } = await admin.from("discord_country_emojis").update({
    ...values,
    updated_at: new Date().toISOString(),
  }).eq("country_key", countryKey).eq("guild_id", TLR_DISCORD_GUILD_ID);
  if (error) throw new Error("EMOJI_CACHE_UPDATE_FAILED");
}

async function waitForEmoji(admin: AdminClient, countryKey: string): Promise<DiscordEmoji | null> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const { data } = await admin.from("discord_country_emojis")
      .select("emoji_id,emoji_name,status")
      .eq("country_key", countryKey).eq("guild_id", TLR_DISCORD_GUILD_ID)
      .maybeSingle<EmojiRecord>();
    if (data?.status === "ready" && data.emoji_id) return { id: data.emoji_id, name: data.emoji_name };
    if (data?.status === "failed") return null;
  }
  return null;
}

async function ensureCountryEmoji(
  request: ApiRequest,
  admin: AdminClient,
  token: string,
  country: CatalogCountry,
): Promise<DiscordEmoji> {
  const emojiName = countryEmojiName(country.key);
  const { data, error } = await admin.rpc("tlr_reserve_country_emoji", {
    p_country_key: country.key,
    p_guild_id: TLR_DISCORD_GUILD_ID,
    p_emoji_name: emojiName,
  });
  if (error || !Array.isArray(data) || !data[0]) {
    const emojis = await discordJson<DiscordEmoji[]>(`${DISCORD_API}/guilds/${TLR_DISCORD_GUILD_ID}/emojis`, token);
    const existing = emojis.find((emoji) => emoji.name === emojiName);
    if (existing) return existing;
    if (!country.flagPath) throw new Error("FLAG_PATH_MISSING");
    return discordJson<DiscordEmoji>(`${DISCORD_API}/guilds/${TLR_DISCORD_GUILD_ID}/emojis`, token, {
      method: "POST",
      body: JSON.stringify({ name: emojiName, image: await loadFlagData(request, country.flagPath) }),
    });
  }
  const reservation = data[0] as { emoji_id: string | null; emoji_name: string; emoji_status: string; should_create: boolean };
  if (reservation.emoji_status === "ready" && reservation.emoji_id) {
    return { id: reservation.emoji_id, name: reservation.emoji_name };
  }
  if (!reservation.should_create) {
    const ready = await waitForEmoji(admin, country.key);
    if (ready) return ready;
    throw new Error("EMOJI_CREATION_IN_PROGRESS");
  }
  try {
    const emojis = await discordJson<DiscordEmoji[]>(`${DISCORD_API}/guilds/${TLR_DISCORD_GUILD_ID}/emojis`, token);
    const existing = emojis.find((emoji) => emoji.name === emojiName);
    if (existing) {
      await markEmoji(admin, country.key, { emoji_id: existing.id, emoji_name: existing.name, status: "ready", failure_code: null });
      return existing;
    }
    if (!country.flagPath) throw new Error("FLAG_PATH_MISSING");
    const image = await loadFlagData(request, country.flagPath);
    const created = await discordJson<DiscordEmoji>(`${DISCORD_API}/guilds/${TLR_DISCORD_GUILD_ID}/emojis`, token, {
      method: "POST",
      body: JSON.stringify({ name: emojiName, image }),
    });
    await markEmoji(admin, country.key, { emoji_id: created.id, emoji_name: created.name, status: "ready", failure_code: null });
    return created;
  } catch (error) {
    await markEmoji(admin, country.key, { status: "failed", failure_code: error instanceof Error ? error.message.slice(0, 160) : "UNKNOWN" }).catch(() => undefined);
    throw error;
  }
}

export async function submitCountryApplication(
  request: ApiRequest,
  admin: AdminClient,
  input: { countryKey: string; userId: string; discordUserId: string },
): Promise<ApplicationResult> {
  const country = countryByKey(input.countryKey);
  if (!country) throw new Error("COUNTRY_NOT_FOUND");
  await ensureDiscordCountryAssignment(admin, input.countryKey, input.userId);
  const { data, error } = await admin.rpc("tlr_begin_country_application", {
    p_country_key: input.countryKey,
    p_user_id: input.userId,
    p_discord_user_id: input.discordUserId,
  });
  if (error || !Array.isArray(data) || !data[0]) {
    return notifyCountryApplication(request, admin, {
      applicationId: `legacy-${input.countryKey}-${input.userId}`,
      countryKey: input.countryKey,
      userId: input.userId,
      discordUserId: input.discordUserId,
      persist: false,
    });
  }
  const begun = data[0] as { application_id: string; application_status: string; should_notify: boolean };
  if (!begun.should_notify) {
    return { applicationId: begun.application_id, status: begun.application_status, duplicate: true };
  }
  return notifyCountryApplication(request, admin, {
    applicationId: begun.application_id,
    countryKey: input.countryKey,
    userId: input.userId,
    discordUserId: input.discordUserId,
  });
}

async function ensureDiscordCountryAssignment(admin: AdminClient, countryKey: string, userId: string): Promise<void> {
  const [catalogResult, userOwnershipResult, countryOwnershipResult] = await Promise.all([
    admin.from("countries").select("country_key").eq("country_key", countryKey).eq("active", true).maybeSingle<{ country_key: string }>(),
    admin.from("country_ownerships").select("country_key,user_id,status").eq("user_id", userId).eq("status", "active").maybeSingle<{ country_key: string; user_id: string; status: string }>(),
    admin.from("country_ownerships").select("country_key,user_id,status").eq("country_key", countryKey).maybeSingle<{ country_key: string; user_id: string; status: string }>(),
  ]);
  if (catalogResult.error || !catalogResult.data) throw new Error("COUNTRY_NOT_FOUND");
  if (userOwnershipResult.error || countryOwnershipResult.error) throw new Error("OWNERSHIP_STATE_UNAVAILABLE");
  if (userOwnershipResult.data && userOwnershipResult.data.country_key !== countryKey) throw new Error("COUNTRY_ALREADY_ASSIGNED");
  if (countryOwnershipResult.data?.status === "active" && countryOwnershipResult.data.user_id !== userId) throw new Error("COUNTRY_ALREADY_CLAIMED");
  if (countryOwnershipResult.data?.status === "active") return;
  const now = new Date().toISOString();
  const mutation = countryOwnershipResult.data
    ? await admin.from("country_ownerships").update({ user_id: userId, status: "active", assigned_at: now, revoked_at: null, updated_at: now }).eq("country_key", countryKey).eq("status", "revoked")
    : await admin.from("country_ownerships").insert({ country_key: countryKey, user_id: userId, status: "active", assigned_at: now, updated_at: now });
  if (mutation.error) {
    const code = mutation.error.code === "23505" ? "COUNTRY_ALREADY_CLAIMED" : "COUNTRY_ASSIGNMENT_FAILED";
    throw new Error(code);
  }
}

async function notifyCountryApplication(
  request: ApiRequest,
  admin: AdminClient,
  input: { applicationId: string; countryKey: string; userId: string; discordUserId: string; persist?: boolean },
): Promise<ApplicationResult> {
  const country = countryByKey(input.countryKey);
  if (!country) throw new Error("COUNTRY_NOT_FOUND");
  try {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) throw new Error("DISCORD_BOT_TOKEN_MISSING");
    const emoji = await ensureCountryEmoji(request, admin, token, country);
    const message = await discordJson<{ id: string }>(`${DISCORD_API}/channels/${TLR_APPLICATION_CHANNEL_ID}/messages`, token, {
      method: "POST",
      body: JSON.stringify({
        content: countryApplicationMessage(input.discordUserId, emoji, country.name),
        allowed_mentions: { parse: ["users"] },
        nonce: applicationNonce(input.applicationId),
        enforce_nonce: true,
      }),
    });
    if (input.persist !== false) {
      const { error: updateError } = await admin.from("country_applications").update({
        status: "notified",
        discord_message_id: message.id,
        notified_at: new Date().toISOString(),
        failure_code: null,
        updated_at: new Date().toISOString(),
      }).eq("id", input.applicationId);
      if (updateError) throw new Error("APPLICATION_FINALIZE_FAILED");
    }
    return { applicationId: input.applicationId, status: "notified", duplicate: false };
  } catch (error) {
    const failure = error instanceof Error ? error.message.slice(0, 220) : "UNKNOWN";
    if (input.persist !== false) {
      await admin.from("country_applications").update({ status: "failed", failure_code: failure, updated_at: new Date().toISOString() }).eq("id", input.applicationId);
    }
    console.error("country application notification failed", { countryKey: input.countryKey, userId: input.userId, code: failure });
    throw error;
  }
}

export async function expelCountryAssignment(
  request: ApiRequest,
  admin: AdminClient,
  input: { countryKey: string; userId: string; reason: string },
): Promise<{ countryKey: string; userId: string; discordMessageId: string }> {
  const country = countryByKey(input.countryKey);
  const reason = input.reason.replace(/[\r\n]+/gu, " ").trim().slice(0, 500);
  if (!country) throw new Error("COUNTRY_NOT_FOUND");
  if (!reason) throw new Error("EXPULSION_REASON_REQUIRED");

  const [ownershipResult, profileResult] = await Promise.all([
    admin.from("country_ownerships")
      .select("country_key,user_id,status")
      .eq("country_key", input.countryKey)
      .eq("user_id", input.userId)
      .eq("status", "active")
      .maybeSingle<{ country_key: string; user_id: string; status: string }>(),
    admin.from("profiles")
      .select("id,discord_user_id,discord_username")
      .eq("id", input.userId)
      .maybeSingle<{ id: string; discord_user_id: string | null; discord_username: string | null }>(),
  ]);
  if (ownershipResult.error || profileResult.error) throw new Error("EXPULSION_STATE_UNAVAILABLE");
  if (!ownershipResult.data) throw new Error("ACTIVE_ASSIGNMENT_NOT_FOUND");
  if (!profileResult.data?.discord_user_id) throw new Error("DISCORD_PROFILE_NOT_FOUND");

  const now = new Date().toISOString();
  const revoked = await admin.from("country_ownerships")
    .update({ status: "revoked", revoked_at: now, updated_at: now })
    .eq("country_key", input.countryKey)
    .eq("user_id", input.userId)
    .eq("status", "active")
    .select("country_key")
    .maybeSingle<{ country_key: string }>();
  if (revoked.error || !revoked.data) throw new Error("COUNTRY_EXPULSION_FAILED");

  try {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) throw new Error("DISCORD_BOT_TOKEN_MISSING");
    const emoji = await ensureCountryEmoji(request, admin, token, country);
    const username = profileResult.data.discord_username?.trim() || profileResult.data.discord_user_id;
    const message = await discordJson<{ id: string }>(`${DISCORD_API}/channels/${TLR_APPLICATION_CHANNEL_ID}/messages`, token, {
      method: "POST",
      body: JSON.stringify({
        content: countryExpulsionMessage(username, emoji, country.name, reason),
        allowed_mentions: { parse: [] },
        nonce: applicationNonce(`expel-${input.countryKey}-${input.userId}-${now}`),
        enforce_nonce: true,
      }),
    });
    return { countryKey: input.countryKey, userId: input.userId, discordMessageId: message.id };
  } catch (error) {
    console.error("country expulsion notification failed", {
      countryKey: input.countryKey,
      userId: input.userId,
      code: error instanceof Error ? error.message.slice(0, 220) : "UNKNOWN",
    });
    throw new Error("COUNTRY_EXPELLED_NOTIFICATION_FAILED", { cause: error });
  }
}

export async function dispatchPendingCountryApplications(
  request: ApiRequest,
  admin: AdminClient,
): Promise<{ sent: number; failed: number; remaining: number }> {
  const { data, error } = await admin.from("country_applications")
    .select("id,country_key,user_id,discord_user_id,status")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(62)
    .returns<Array<{ id: string; country_key: string; user_id: string; discord_user_id: string; status: string }>>();
  if (error) return dispatchLegacyCountryApplications(request, admin);
  let sent = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const claimed = await admin.from("country_applications").update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", row.id).eq("status", "pending").select("id").maybeSingle<{ id: string }>();
    if (claimed.error || !claimed.data) continue;
    try {
      await notifyCountryApplication(request, admin, {
        applicationId: row.id,
        countryKey: row.country_key,
        userId: row.user_id,
        discordUserId: row.discord_user_id,
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  const { count } = await admin.from("country_applications").select("id", { count: "exact", head: true }).eq("status", "pending");
  return { sent, failed, remaining: count ?? 0 };
}

async function dispatchLegacyCountryApplications(
  request: ApiRequest,
  admin: AdminClient,
): Promise<{ sent: number; failed: number; remaining: number }> {
  const [ownershipResult, adminResult] = await Promise.all([
    admin.from("country_ownerships").select("country_key,user_id").eq("status", "active").returns<Array<{ country_key: string; user_id: string }>>(),
    admin.from("navi_admin_members").select("profile_id").eq("active", true).returns<Array<{ profile_id: string }>>(),
  ]);
  if (ownershipResult.error) throw new Error("LEGACY_APPLICATION_QUEUE_UNAVAILABLE");
  const adminIds = new Set((adminResult.data ?? []).map((row) => row.profile_id));
  const ownerships = (ownershipResult.data ?? []).filter((row) => !adminIds.has(row.user_id));
  const userIds = [...new Set(ownerships.map((row) => row.user_id))];
  const profilesResult = userIds.length
    ? await admin.from("profiles").select("id,discord_user_id").in("id", userIds).returns<Array<{ id: string; discord_user_id: string }>>()
    : { data: [], error: null };
  if (profilesResult.error) throw new Error("LEGACY_PROFILE_QUEUE_UNAVAILABLE");
  const discordIds = new Map((profilesResult.data ?? []).map((row) => [row.id, row.discord_user_id]));
  let sent = 0;
  let failed = 0;
  for (const row of ownerships) {
    const discordUserId = discordIds.get(row.user_id);
    if (!discordUserId) { failed += 1; continue; }
    try {
      await notifyCountryApplication(request, admin, {
        applicationId: `legacy-${row.country_key}-${row.user_id}`,
        countryKey: row.country_key,
        userId: row.user_id,
        discordUserId,
        persist: false,
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed, remaining: 0 };
}
