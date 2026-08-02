import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { ApiRequest, ApiResponse } from "./types";

export const ADMIN_SESSION_COOKIE = "tlr_directorate_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 4 * 60 * 60;

export type AdminSession = {
  sub: string;
  role: "admin" | "superadmin";
  kind: "bootstrap" | "discord";
  iat: number;
  exp: number;
};

type AdminConfig = {
  bootstrapEnabled: boolean;
  bootstrapSecretHash: string | null;
  sessionSecret: string | null;
};

type RateLimitEntry = { failures: number; resetAt: number };
const rateLimit = new Map<string, RateLimitEntry>();
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function getAdminConfig(): AdminConfig {
  return {
    bootstrapEnabled: process.env.ADMIN_BOOTSTRAP_ENABLED === "true",
    bootstrapSecretHash: process.env.ADMIN_BOOTSTRAP_SECRET_HASH ?? null,
    sessionSecret: process.env.ADMIN_SESSION_SECRET ?? null,
  };
}

/** Generate an encoded scrypt hash for setup scripts only. Never store the input. */
export function createBootstrapSecretHash(secret: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(secret, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyBootstrapSecret(secret: string, encoded: string): boolean {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N < 1024 || r < 1 || p < 1) return false;
  try {
    const salt = Buffer.from(saltRaw, "base64url");
    const expected = Buffer.from(hashRaw, "base64url");
    const actual = scryptSync(secret, salt, expected.length, { N, r, p, maxmem: 128 * 1024 * 1024 });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminSession(role: AdminSession["role"], kind: AdminSession["kind"], secret: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const payload: AdminSession = { sub: "directorate", role, kind, iat, exp: iat + ADMIN_SESSION_MAX_AGE_SECONDS };
  const encoded = base64Url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyAdminSession(token: string, secret: string, now = Date.now()): AdminSession | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded, secret);
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;
  const decoded = fromBase64Url(encoded);
  if (!decoded) return null;
  try {
    const payload = JSON.parse(decoded) as Partial<AdminSession>;
    if (payload.sub !== "directorate" || (payload.role !== "admin" && payload.role !== "superadmin") || (payload.kind !== "bootstrap" && payload.kind !== "discord")) return null;
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
    return payload as AdminSession;
  } catch {
    return null;
  }
}

function requestKey(request: ApiRequest): string {
  const forwarded = request.headers["x-forwarded-for"] ?? request.headers["x-real-ip"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(",")[0]?.trim() || "unknown";
}

export function isRateLimited(request: ApiRequest, now = Date.now()): boolean {
  const entry = rateLimit.get(requestKey(request));
  if (!entry || entry.resetAt <= now) return false;
  return entry.failures >= MAX_FAILURES;
}

export function recordBootstrapFailure(request: ApiRequest, now = Date.now()): void {
  const key = requestKey(request);
  const previous = rateLimit.get(key);
  if (!previous || previous.resetAt <= now) {
    rateLimit.set(key, { failures: 1, resetAt: now + WINDOW_MS });
    return;
  }
  previous.failures += 1;
}

export function clearBootstrapFailures(request: ApiRequest): void {
  rateLimit.delete(requestKey(request));
}

function getCookie(request: ApiRequest): string | null {
  return request.cookies?.[ADMIN_SESSION_COOKIE] ?? null;
}

export function getAdminSession(request: ApiRequest): AdminSession | null {
  const secret = getAdminConfig().sessionSecret;
  if (!secret) return null;
  const token = getCookie(request);
  return token ? verifyAdminSession(token, secret) : null;
}

/** Bootstrap and future Discord admin verification share this guard. */
export function requireAdminSession(request: ApiRequest, response: ApiResponse): AdminSession | null {
  const session = getAdminSession(request);
  if (!session) {
    response.status(404).json({ error: "NOT_FOUND" });
    return null;
  }
  return session;
}

export function adminSessionCookie(token: string): string {
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}
