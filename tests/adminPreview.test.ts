import { describe, expect, it } from "vitest";
import { createAdminPreviewSession, verifyAdminPreviewSession } from "../server/adminPreview";
import { ADMIN_SESSION_MAX_AGE_SECONDS, adminSessionCookie, createAdminSession, verifyAdminSession } from "../server/adminAuth";
import { AUTH_SESSION_MAX_AGE_SECONDS, authSessionCookie, createPersistentSession, verifyPersistentSession } from "../server/persistentSession";

describe("administrator preview and persistent sessions", () => {
  const secret = "test-secret-at-least-thirty-two-characters";
  it("signs a read-only country preview and rejects tampering or expiry", () => {
    const now = Date.UTC(2026, 7, 30);
    const token = createAdminPreviewSession("country-001", secret, now);
    expect(verifyAdminPreviewSession(token, secret, now)?.countryKey).toBe("country-001");
    expect(verifyAdminPreviewSession(`${token}x`, secret, now)).toBeNull();
    expect(verifyAdminPreviewSession(token, secret, now + 5 * 60 * 60 * 1000)).toBeNull();
  });

  it("keeps verified administrator and user cookies for thirty days", () => {
    expect(ADMIN_SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(AUTH_SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(adminSessionCookie(createAdminSession("admin", "discord", secret))).toContain("HttpOnly; Secure; SameSite=Lax");
    const userToken = createPersistentSession("discord-user-id", secret, 1000);
    expect(authSessionCookie(userToken)).toContain("Max-Age=2592000; HttpOnly; Secure; SameSite=Lax");
    expect(verifyPersistentSession(userToken, secret, 1000 + 29 * 24 * 60 * 60 * 1000)?.sub).toBe("discord-user-id");
    expect(verifyPersistentSession(`${userToken}x`, secret, 1000)).toBeNull();
    const adminToken = createAdminSession("admin", "discord", secret, 1000);
    expect(verifyAdminSession(adminToken, secret, 1000 + 29 * 24 * 60 * 60 * 1000)).not.toBeNull();
  });
});
