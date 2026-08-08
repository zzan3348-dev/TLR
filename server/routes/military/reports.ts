import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const env = getServerEnv(); if (!env) { response.status(503).json({ error: "MILITARY_SERVER_NOT_CONFIGURED" }); return; }
  const result = await getAdminClient(env).from("military_war_reports").select("*").eq("visibility", "PUBLIC").order("report_world_date", { ascending: false }).limit(100);
  if (result.error) { response.status(503).json({ error: "WAR_REPORTS_UNAVAILABLE" }); return; }
  response.status(200).json(result.data ?? []);
}
