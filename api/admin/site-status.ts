import { getAdminClient, getServerEnv } from "../../server/auth.js";
import { requireAdminSession } from "../../server/adminAuth.js";
import { loadSiteStatus } from "../../server/siteStatus.js";
import type { ApiRequest, ApiResponse } from "../../server/types.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const session = requireAdminSession(request, response);
  if (!session) return;
  const env = getServerEnv();
  if (!env) {
    response.status(503).json({ error: "SERVER_NOT_CONFIGURED" });
    return;
  }
  const admin = getAdminClient(env);
  if (request.method === "GET") {
    try {
      response.status(200).json(await loadSiteStatus(admin));
    } catch {
      response.status(503).json({ error: "SITE_STATUS_UNAVAILABLE" });
    }
    return;
  }
  const body = request.body && typeof request.body === "object" ? request.body as { action?: unknown } : {};
  if (body.action !== "OPEN") {
    response.status(400).json({ error: "INVALID_SITE_STATUS_ACTION" });
    return;
  }
  const openedBy = `${session.kind}:${session.sub}:${session.role}`;
  const { data, error } = await admin.rpc("tlr_open_site", { p_opened_by: openedBy });
  if (error || !Array.isArray(data) || !data[0]) {
    console.error("site open failed", { code: error?.code ?? "NO_ROW" });
    response.status(503).json({ error: "SITE_OPEN_FAILED" });
    return;
  }
  const row = data[0] as { status: string; opened_at: string | null; opened_by: string | null; changed: boolean };
  response.status(200).json({ status: row.status, openedAt: row.opened_at, openedBy: row.opened_by, changed: row.changed });
}
