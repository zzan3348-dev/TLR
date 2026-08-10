import type { ApiRequest, ApiResponse } from "../../server/types.js";
import { getAdminClient, getServerEnv } from "../../server/auth.js";
import { requireAdminSession } from "../../server/adminAuth.js";
import researchAdmin from "../../server/routes/admin/research.js";

const actionKinds = new Set([
  "REVOKE_COUNTRY_OWNERSHIP",
  "DENY_COUNTRY_ACCESS",
  "SUSPEND_ALL_PLAY",
  "BLOCK_ACCOUNT",
]);

type ActionBody = {
  action?: unknown;
  targetUserId?: unknown;
  targetCountryKey?: unknown;
  reason?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
};

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const rawDomain = request.query?.domain;
  const domain = Array.isArray(rawDomain) ? rawDomain[0] : rawDomain;
  if (domain === "research") {
    await researchAdmin(request, response);
    return;
  }
  if (request.method !== "POST") {
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const session = requireAdminSession(request, response);
  if (!session) return;
  const body = (request.body ?? {}) as ActionBody;
  const action = typeof body.action === "string" ? body.action : "";
  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : null;
  const targetCountryKey = typeof body.targetCountryKey === "string" ? body.targetCountryKey : null;
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 1000) : "";
  if (!actionKinds.has(action) || !reason || (!targetUserId && !targetCountryKey && action !== "SUSPEND_ALL_PLAY")) {
    response.status(400).json({ error: "INVALID_ACTION" });
    return;
  }

  const env = getServerEnv();
  let recorded = false;
  if (env) {
    const admin = getAdminClient(env);
    const { error } = await admin.from("admin_action_logs").insert({
      admin_user_id: session.sub,
      admin_kind: session.kind,
      target_user_id: targetUserId,
      target_country_key: targetCountryKey,
      action_kind: action,
      reason,
      starts_at: typeof body.startsAt === "string" ? body.startsAt : new Date().toISOString(),
      ends_at: typeof body.endsAt === "string" ? body.endsAt : null,
    });
    recorded = !error;
  }
  response.status(200).json({ ok: true, recorded, action });
}
