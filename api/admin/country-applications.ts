import { requireAdminSession } from "../../server/adminAuth.js";
import { getAdminClient, getServerEnv } from "../../server/auth.js";
import { dispatchPendingCountryApplications } from "../../server/countryApplications.js";
import type { ApiRequest, ApiResponse } from "../../server/types.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  if (!requireAdminSession(request, response)) return;
  const env = getServerEnv();
  if (!env) {
    response.status(503).json({ error: "SERVER_NOT_CONFIGURED" });
    return;
  }
  const admin = getAdminClient(env);
  if (request.method === "POST") {
    try {
      response.status(200).json(await dispatchPendingCountryApplications(request, admin));
    } catch (error) {
      console.error("country application queue dispatch failed", { code: error instanceof Error ? error.message : "UNKNOWN" });
      response.status(503).json({ error: "APPLICATION_DISPATCH_FAILED" });
    }
    return;
  }
  const { data, error } = await admin.from("country_applications")
    .select("id,country_key,discord_user_id,status,created_at,notified_at")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    response.status(503).json({ error: "APPLICATION_QUEUE_UNAVAILABLE" });
    return;
  }
  response.status(200).json({ applications: data ?? [] });
}
