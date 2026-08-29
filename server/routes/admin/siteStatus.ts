import { getAdminClient, getServerEnv } from "../../auth.js";
import { requireAdminSession } from "../../adminAuth.js";
import { loadSiteStatus } from "../../siteStatus.js";
import type { ApiRequest, ApiResponse } from "../../types.js";

export default async function siteStatusAdmin(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") return void response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  const session = requireAdminSession(request, response);
  if (!session) return;
  const env = getServerEnv();
  if (!env) return void response.status(503).json({ error: "SERVER_NOT_CONFIGURED" });
  const admin = getAdminClient(env);
  if (request.method === "GET") return void response.status(200).json(await loadSiteStatus(admin));
  const body = request.body && typeof request.body === "object" ? request.body as { action?: unknown } : {};
  if (body.action !== "OPEN") return void response.status(400).json({ error: "INVALID_SITE_STATUS_ACTION" });
  const { data, error } = await admin.rpc("tlr_open_site", { p_opened_by: `${session.kind}:${session.sub}:${session.role}` });
  if (error || !Array.isArray(data) || !data[0]) return void response.status(503).json({ error: "SITE_OPEN_FAILED" });
  const row = data[0] as { status: string; opened_at: string | null; opened_by: string | null; changed: boolean };
  response.status(200).json({ status: row.status, openedAt: row.opened_at, openedBy: row.opened_by, changed: row.changed });
}
