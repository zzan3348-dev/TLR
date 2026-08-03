import type { ApiRequest, ApiResponse } from "../../types.js";
import { getAdminClient, getServerEnv } from "../../auth.js";
import { currentWorldDate, requireDiplomacyActor, type NotificationRow, type ProposalRow } from "../../diplomacy.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const env = getServerEnv();
  if (!env) {
    response.status(503).json({ error: "DIPLOMACY_SERVER_NOT_CONFIGURED" });
    return;
  }
  const admin = getAdminClient(env);
  const actor = await requireDiplomacyActor(request, response, admin);
  if (!actor) return;

  if (request.method === "GET") {
    try {
      const worldDate = await currentWorldDate(admin);
      const { data: notifications, error } = await admin.from("diplomacy_notifications").select("*")
        .eq("recipient_country_key", actor.countryKey)
        .is("dismissed_at", null)
        .order("created_at", { ascending: true }).limit(100).returns<NotificationRow[]>();
      if (error) throw error;
      const proposalIds = [...new Set((notifications ?? []).map((row) => row.proposal_id).filter((id): id is string => Boolean(id)))];
      let proposalMap = new Map<string, ProposalRow>();
      if (proposalIds.length > 0) {
        const result = await admin.from("diplomatic_proposals").select("*").in("id", proposalIds).returns<ProposalRow[]>();
        if (result.error) throw result.error;
        proposalMap = new Map((result.data ?? []).map((row) => [row.id, row]));
      }
      const rows = (notifications ?? []).map((row) => ({ ...row, proposal: row.proposal_id ? proposalMap.get(row.proposal_id) ?? null : null }));
      rows.sort((a, b) => {
        const aDeadline = a.proposal?.response_deadline_world_date ?? "9999-12-31";
        const bDeadline = b.proposal?.response_deadline_world_date ?? "9999-12-31";
        return aDeadline.localeCompare(bDeadline) || a.created_at.localeCompare(b.created_at);
      });
      response.status(200).json({ worldDate, unreadCount: rows.filter((row) => !row.read_at).length, notifications: rows });
    } catch (error) {
      console.error("notification list failed", error);
      response.status(503).json({ error: "DIPLOMACY_DATA_UNAVAILABLE" });
    }
    return;
  }

  if (request.method === "PATCH") {
    const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
    const id = typeof body.notificationId === "string" ? body.notificationId : "";
    const action = typeof body.action === "string" ? body.action : "";
    if (!/^[0-9a-f-]{36}$/iu.test(id) || (action !== "READ" && action !== "DISMISS")) {
      response.status(400).json({ error: "INVALID_NOTIFICATION_ACTION" });
      return;
    }
    const update = action === "READ" ? { read_at: new Date().toISOString() } : { dismissed_at: new Date().toISOString() };
    const { data, error } = await admin.from("diplomacy_notifications").update(update)
      .eq("id", id).eq("recipient_country_key", actor.countryKey).select("id").maybeSingle<{ id: string }>();
    if (error) {
      response.status(500).json({ error: "NOTIFICATION_UPDATE_FAILED" });
      return;
    }
    if (!data) {
      response.status(404).json({ error: "NOTIFICATION_NOT_FOUND" });
      return;
    }
    response.status(200).json({ ok: true });
    return;
  }
  response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
}
