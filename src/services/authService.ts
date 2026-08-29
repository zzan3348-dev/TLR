import type {
  AuthChangeEvent,
  Session,
  User,
} from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

const NEXT_PATH_KEY = "tlr-auth-next-path";

export type AccessStatus = "active" | "review" | "blocked";

export type AuthProfile = {
  id: string;
  discordUserId: string;
  discordUsername: string | null;
  discordAvatarUrl: string | null;
  accessStatus: AccessStatus;
  blockedReason: string | null;
  blockedAt: string | null;
  countryKey: string | null;
};

export type CountryClaimResult = {
  ok: boolean;
  countryKey?: string;
  error?: string;
};

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

export function rememberNextPath(nextPath: string): void {
  try {
    sessionStorage.setItem(NEXT_PATH_KEY, safeNextPath(nextPath));
  } catch {
    // Storage may be unavailable in privacy-restricted browsers.
  }
}

export function readNextPath(): string {
  try {
    return safeNextPath(sessionStorage.getItem(NEXT_PATH_KEY));
  } catch {
    return "/";
  }
}

export function clearNextPath(): void {
  try {
    sessionStorage.removeItem(NEXT_PATH_KEY);
  } catch {
    // Storage may be unavailable in privacy-restricted browsers.
  }
}

export async function signInWithDiscord(nextPath = "/"): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!supabase || !isSupabaseConfigured) {
    return { ok: false, error: "AUTH_NOT_CONFIGURED" };
  }

  const normalizedNextPath = safeNextPath(nextPath);
  rememberNextPath(normalizedNextPath);
  const redirectUrl = new URL("/auth/callback", window.location.origin);
  redirectUrl.searchParams.set("next", normalizedNextPath);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: redirectUrl.toString(),
      scopes: "identify",
    },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) {
    return { ok: true };
  }
  const { error } = await supabase.auth.signOut();
  clearNextPath();
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) {
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) {
    return null;
  }
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): { unsubscribe: () => void } {
  if (!supabase) {
    return { unsubscribe: () => undefined };
  }
  const { data } = supabase.auth.onAuthStateChange(callback);
  return { unsubscribe: () => data.subscription.unsubscribe() };
}

export async function completeAuthCallback(): Promise<{
  nextPath: string;
  error: string | null;
}> {
  if (!supabase) {
    return { nextPath: readNextPath(), error: "AUTH_NOT_CONFIGURED" };
  }
  const url = new URL(window.location.href);
  const nextPath = safeNextPath(url.searchParams.get("next") ?? readNextPath());
  const code = url.searchParams.get("code");
  if (!code) {
    return { nextPath, error: url.searchParams.get("error_description") ?? null };
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return { nextPath, error: error.message };
  }
  return { nextPath, error: null };
}

export async function refreshServerProfile(): Promise<AuthProfile | null> {
  const session = await getSession();
  if (!session) {
    return null;
  }
  const response = await fetch("/api/auth/session", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    credentials: "include",
  });
  if (!response.ok) {
    return null;
  }
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const profile = (payload as { profile?: unknown }).profile;
  if (!profile || typeof profile !== "object") {
    return null;
  }
  const row = profile as Record<string, unknown>;
  const ownershipCountryKey = (payload as { ownershipCountryKey?: unknown }).ownershipCountryKey;
  if (
    typeof row.id !== "string" ||
    typeof row.discord_user_id !== "string" ||
    (row.access_status !== "active" &&
      row.access_status !== "review" &&
      row.access_status !== "blocked")
  ) {
    return null;
  }
  return {
    id: row.id,
    discordUserId: row.discord_user_id,
    discordUsername:
      typeof row.discord_username === "string" ? row.discord_username : null,
    discordAvatarUrl:
      typeof row.discord_avatar_url === "string"
        ? row.discord_avatar_url
        : null,
    accessStatus: row.access_status,
    blockedReason:
      typeof row.blocked_reason === "string" ? row.blocked_reason : null,
    blockedAt: typeof row.blocked_at === "string" ? row.blocked_at : null,
    countryKey: typeof ownershipCountryKey === "string" ? ownershipCountryKey : null,
  };
}

export async function claimCountryOwnership(countryKey: string): Promise<CountryClaimResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHORIZED" };
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ action: "CLAIM_COUNTRY", countryKey }),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  if (!response.ok) {
    return {
      ok: false,
      error: typeof record.error === "string" ? record.error : "COUNTRY_CLAIM_FAILED",
      countryKey: typeof record.countryKey === "string" ? record.countryKey : undefined,
    };
  }
  return {
    ok: true,
    countryKey: typeof record.ownershipCountryKey === "string" ? record.ownershipCountryKey : countryKey,
  };
}
