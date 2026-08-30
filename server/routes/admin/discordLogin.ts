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
  const membership = await admin.from("navi_admin_members").select("role,active").eq("profile_id", user.id).eq("active", true).maybeSingle<{ role: "admin" | "superadmin"; active: boolean }>();
  if (membership.error || !membership.data) return void response.status(404).json({ error: "NOT_FOUND" });
  response.setHeader("Set-Cookie", adminSessionCookie(createAdminSession(membership.data.role, "discord", secret)));
  response.status(200).json({ ok: true, role: membership.data.role });
}
