/// <reference types="node" />
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAdminConfig, getAdminSession } from "./adminAuth.js";
import type { ApiRequest } from "./types.js";

export const ADMIN_PREVIEW_COOKIE = "tlr_admin_preview";
export const ADMIN_PREVIEW_MAX_AGE_SECONDS = 4 * 60 * 60;

export type AdminPreviewSession = { countryKey: string; iat: number; exp: number; readOnly: true };

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`preview:${payload}`).digest("base64url");
}

export function createAdminPreviewSession(countryKey: string, secret: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const payload: AdminPreviewSession = { countryKey, iat, exp: iat + ADMIN_PREVIEW_MAX_AGE_SECONDS, readOnly: true };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyAdminPreviewSession(token: string, secret: string, now = Date.now()): AdminPreviewSession | null {
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) return null;
  const expected = signature(encoded, secret);
  const actualBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<AdminPreviewSession>;
    if (!payload.readOnly || typeof payload.countryKey !== "string" || !/^country-\d{3}$/u.test(payload.countryKey)) return null;
    if (typeof payload.exp !== "number" || payload.exp <= Math.floor(now / 1000)) return null;
    return payload as AdminPreviewSession;
  } catch { return null; }
}

export function getAdminPreview(request: ApiRequest): AdminPreviewSession | null {
  if (!getAdminSession(request)) return null;
  const secret = getAdminConfig().sessionSecret;
  const token = request.cookies?.[ADMIN_PREVIEW_COOKIE];
  return secret && token ? verifyAdminPreviewSession(token, secret) : null;
}

export function adminPreviewCookie(token: string): string {
  return `${ADMIN_PREVIEW_COOKIE}=${token}; Path=/; Max-Age=${ADMIN_PREVIEW_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearAdminPreviewCookie(): string {
  return `${ADMIN_PREVIEW_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
