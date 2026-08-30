/// <reference types="node" />
import { createHmac, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ApiRequest } from "./types.js";
import { persistentSessionUserId } from "./persistentSession.js";

export type AdminClient = SupabaseClient;
export type AuthenticatedUser = {
  id: string;
  identities?: Array<{
    id?: string;
    provider?: string;
    identity_data?: unknown;
  }> | null;
  user_metadata?: Record<string, unknown>;
};

type ServerEnv = {
  url: string;
  secretKey: string;
  ipPepper: string;
  devicePepper: string;
  ipInfoToken: string | null;
};

export type RequestSignals = {
  deviceHash: string | null;
  ipHash: string | null;
  asn: string | null;
  networkName: string | null;
  networkType: string | null;
  countryCode: string | null;
};

export function getServerEnv(): ServerEnv | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return null;
  return {
    url,
    secretKey,
    ipPepper: process.env.IP_HASH_PEPPER ?? "development-ip-pepper",
    devicePepper: process.env.DEVICE_HASH_PEPPER ?? "development-device-pepper",
    ipInfoToken: process.env.IPINFO_TOKEN ?? null,
  };
}

export function getAdminClient(env: ServerEnv): AdminClient {
  return createClient(env.url, env.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getBearerToken(request: ApiRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export async function getAuthenticatedUser(request: ApiRequest, admin: AdminClient): Promise<AuthenticatedUser | null> {
  const token = getBearerToken(request);
  if (!token) {
    const userId = persistentSessionUserId(request);
    if (!userId) return null;
    const authAdmin = admin.auth.admin as unknown as { getUserById(id: string): Promise<{ data: { user: AuthenticatedUser | null }; error: unknown }> };
    const restored = await authAdmin.getUserById(userId);
    return restored.error ? null : restored.data.user;
  }
  // Vercel type-checks every serverless entrypoint in isolation. Keep this
  // boundary structural so different @supabase/auth-js patch types do not
  // erase getUser from the generated function type.
  const auth = admin.auth as unknown as {
    getUser(accessToken: string): Promise<{
      data: { user: AuthenticatedUser | null };
      error: unknown;
    }>;
  };
  const { data, error } = await auth.getUser(token);
  return error || !data.user ? null : data.user;
}

function firstForwardedIp(request: ApiRequest): string | null {
  const values = [request.headers["x-forwarded-for"], request.headers["x-vercel-forwarded-for"], request.headers["x-real-ip"]];
  for (const value of values) {
    const raw = Array.isArray(value) ? value[0] : value;
    const first = raw?.split(",")[0]?.trim();
    if (first && /^[0-9a-f:.]+$/iu.test(first)) return first;
  }
  return null;
}

function hmac(value: string, pepper: string): string {
  return createHmac("sha256", pepper).update(value).digest("hex");
}

export function ensureDeviceCookie(request: ApiRequest): { raw: string; setCookie: string | null } {
  const existing = request.cookies?.tlr_device_id;
  if (existing && /^[0-9a-f]{64}$/iu.test(existing)) return { raw: existing, setCookie: null };
  const raw = randomBytes(32).toString("hex");
  return { raw, setCookie: `tlr_device_id=${raw}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure` };
}

export async function collectRequestSignals(request: ApiRequest, env: ServerEnv): Promise<RequestSignals & { setCookie: string | null }> {
  const device = ensureDeviceCookie(request);
  const ip = firstForwardedIp(request);
  let asn: string | null = null;
  let networkName: string | null = null;
  let countryCode: string | null = null;
  if (env.ipInfoToken && ip) {
    try {
      const response = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(env.ipInfoToken)}`);
      if (response.ok) {
        const payload: unknown = await response.json();
        if (payload && typeof payload === "object") {
          const row = payload as { org?: unknown; country?: unknown; asn?: unknown };
          asn = typeof row.asn === "string" ? row.asn : null;
          networkName = typeof row.org === "string" ? row.org : null;
          countryCode = typeof row.country === "string" ? row.country : null;
        }
      }
    } catch {
      // Fraud signals are best-effort; authentication remains available if IPInfo is unavailable.
    }
  }
  return {
    deviceHash: hmac(device.raw, env.devicePepper),
    ipHash: ip ? hmac(ip, env.ipPepper) : null,
    asn,
    networkName,
    networkType: null,
    countryCode,
    setCookie: device.setCookie,
  };
}

export function discordProviderId(user: AuthenticatedUser): string | null {
  const identity = user.identities?.find((entry) => entry.provider === "discord");
  if (!identity) return null;
  const data = identity.identity_data;
  if (data && typeof data === "object") {
    const providerId = (data as { provider_id?: unknown }).provider_id;
    if (typeof providerId === "string" && providerId) return providerId;
  }
  return identity.id ?? null;
}
