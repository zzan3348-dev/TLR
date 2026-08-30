import { adminSessionCookie, createAdminSession, getAdminConfig } from "../../adminAuth.js";
import { getAdminClient, getAuthenticatedUser, getServerEnv } from "../../auth.js";
import type { ApiRequest, ApiResponse } from "../../types.js";

export default async function discordAdminLogin(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "POST") return void response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  const env = getServerEnv(); const secret = getAdminConfig().sessionSecret;
  if (!env || !secret) return void response.status(404).json({ error: "NOT_FOUND" });
  const admin = getAdminClient(env);
  const user = await getAuthenticatedUser(request, admin);
  if (!user) return void response.status(404).json({ error: "NOT_FOUND" });
  let membership = await admin.from("navi_admin_members").select("role,active").eq("profile_id", user.id).eq("active", true).maybeSingle<{ role: "admin" | "superadmin"; active: boolean }>();
  if (membership.error) return void response.status(404).json({ error: "NOT_FOUND" });
  if (!membership.data) {
    const profile = await admin.from("profiles").select("discord_username").eq("id", user.id).maybeSingle<{ discord_username: string | null }>();
    const allowedNames = new Set((process.env.TLR_ADMIN_DISCORD_USERNAMES ?? "").split(",").map((name) => name.trim().toLocaleLowerCase("en-US")).filter(Boolean));
    const normalizedUsername = profile.data?.discord_username?.trim().toLocaleLowerCase("en-US") ?? "";
    if (profile.error || !normalizedUsername || !allowedNames.has(normalizedUsername)) return void response.status(404).json({ error: "NOT_FOUND" });
    const granted = await admin.from("navi_admin_members").upsert({ profile_id: user.id, role: "admin", active: true, granted_by: "server-admin-allowlist", updated_at: new Date().toISOString() }, { onConflict: "profile_id" }).select("role,active").single<{ role: "admin" | "superadmin"; active: boolean }>();
    if (granted.error || !granted.data) return void response.status(404).json({ error: "NOT_FOUND" });
    membership = granted;
  }
  const activeMembership = membership.data;
  if (!activeMembership) return void response.status(404).json({ error: "NOT_FOUND" });
  response.setHeader("Set-Cookie", adminSessionCookie(createAdminSession(activeMembership.role, "discord", secret)));
  response.status(200).json({ ok: true, role: activeMembership.role });
}
