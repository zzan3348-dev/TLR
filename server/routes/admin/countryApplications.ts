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
  const { data, error } = await admin.from("country_applications").select("id,country_key,discord_user_id,status,created_at,notified_at").order("created_at", { ascending: true }).limit(200);
  if (error) return void response.status(503).json({ error: "APPLICATION_QUEUE_UNAVAILABLE" });
  response.status(200).json({ applications: data ?? [] });
}
