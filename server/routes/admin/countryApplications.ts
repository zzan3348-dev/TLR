import { getAdminSession } from "../../adminAuth.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { dispatchPendingCountryApplications } from "../../countryApplications.js";
import { requireNaviService } from "../../naviAuth.js";
import type { ApiRequest, ApiResponse } from "../../types.js";

export default async function countryApplicationsAdmin(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") return void response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  if (!getAdminSession(request) && !requireNaviService(request, response)) return;
  const env = getServerEnv();
  if (!env) return void response.status(503).json({ error: "SERVER_NOT_CONFIGURED" });
  const admin = getAdminClient(env);
  if (request.method === "POST") {
    try { return void response.status(200).json(await dispatchPendingCountryApplications(request, admin)); }
    catch { return void response.status(503).json({ error: "APPLICATION_DISPATCH_FAILED" }); }
  }
  const ownershipResult = await admin.from("country_ownerships")
    .select("country_key,user_id,assigned_at")
    .eq("status", "active")
    .order("assigned_at", { ascending: true })
    .returns<Array<{ country_key: string; user_id: string; assigned_at: string }>>();
  if (ownershipResult.error) return void response.status(503).json({ error: "ASSIGNMENT_LIST_UNAVAILABLE" });
  const ownerships = ownershipResult.data ?? [];
  const userIds = [...new Set(ownerships.map((row) => row.user_id))];
  const profilesResult = userIds.length
    ? await admin.from("profiles")
      .select("id,discord_user_id,discord_username")
      .in("id", userIds)
      .returns<Array<{ id: string; discord_user_id: string | null; discord_username: string | null }>>()
    : { data: [], error: null };
  if (profilesResult.error) return void response.status(503).json({ error: "ASSIGNMENT_PROFILE_LIST_UNAVAILABLE" });
  const profiles = new Map((profilesResult.data ?? []).map((row) => [row.id, row]));
  response.status(200).json({
    assignments: ownerships.map((ownership) => ({
      countryKey: ownership.country_key,
      userId: ownership.user_id,
      assignedAt: ownership.assigned_at,
      discordUserId: profiles.get(ownership.user_id)?.discord_user_id ?? null,
      discordUsername: profiles.get(ownership.user_id)?.discord_username ?? null,
    })),
  });
}
