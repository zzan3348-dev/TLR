import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { cleanUuid } from "../../military.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
  const conflictId = cleanUuid(Array.isArray(request.query?.conflict_id) ? request.query?.conflict_id[0] : request.query?.conflict_id);
  if (!conflictId) { response.status(400).json({ error: "CONFLICT_REQUIRED" }); return; }
  const env = getServerEnv(); if (!env) { response.status(503).json({ error: "MILITARY_SERVER_NOT_CONFIGURED" }); return; }
  const result = await getAdminClient(env).from("military_fronts").select("*").eq("conflict_id", conflictId).neq("status", "DISSOLVED").order("display_name");
  if (result.error) { response.status(503).json({ error: "FRONTS_UNAVAILABLE" }); return; }
  response.status(200).json(result.data ?? []);
}
