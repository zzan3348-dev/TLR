/// <reference types="node" />
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAdminConfig } from "./adminAuth.js";
import type { ApiRequest } from "./types.js";

export const AUTH_SESSION_COOKIE = "tlr_auth_session";
export const AUTH_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

type PersistentSession = { sub: string; iat: number; exp: number; jti: string };

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`user-session:${payload}`).digest("base64url");
}

export function createPersistentSession(userId: string, secret: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const payload: PersistentSession = { sub: userId, iat, exp: iat + AUTH_SESSION_MAX_AGE_SECONDS, jti: randomBytes(16).toString("base64url") };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyPersistentSession(token: string, secret: string, now = Date.now()): PersistentSession | null {
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) return null;
  const expected = sign(encoded, secret);
  const actualBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<PersistentSession>;
    if (typeof payload.sub !== "string" || !payload.sub || typeof payload.jti !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp <= Math.floor(now / 1000)) return null;
    return payload as PersistentSession;
  } catch { return null; }
}

export function authSessionCookie(token: string): string { return `${AUTH_SESSION_COOKIE}=${token}; Path=/; Max-Age=${AUTH_SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`; }
export function clearAuthSessionCookie(): string { return `${AUTH_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`; }

export function persistentSessionUserId(request: ApiRequest): string | null {
  const token = request.cookies?.[AUTH_SESSION_COOKIE];
  const secret = getAdminConfig().sessionSecret;
  if (!token || !secret) return null;
  return verifyPersistentSession(token, secret)?.sub ?? null;
}

export function ensurePersistentSession(request: ApiRequest, userId: string): string | null {
  if (persistentSessionUserId(request) === userId) return null;
  const secret = getAdminConfig().sessionSecret;
  return secret ? authSessionCookie(createPersistentSession(userId, secret)) : null;
}
