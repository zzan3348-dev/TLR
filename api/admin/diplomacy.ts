import type { ApiRequest, ApiResponse } from "../../server/types.js";
import { getAdminClient, getServerEnv } from "../../server/auth.js";
import { requireAdminSession } from "../../server/adminAuth.js";
import { currentWorldDate, databaseErrorCode, proposalById, type ProposalRow } from "../../server/diplomacy.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const session = requireAdminSession(request, response);
  if (!session) return;
  const env = getServerEnv();
  if (!env) {
    response.status(503).json({ error: "DIPLOMACY_SERVER_NOT_CONFIGURED" });
    return;
  }
  const admin = getAdminClient(env);
  try {
    const worldDate = await currentWorldDate(admin);
    if (request.method === "GET") {
      const { data, error } = await admin.from("diplomatic_proposals").select("*")
        .eq("review_route", "ADMIN").eq("status", "PENDING")
        .order("response_deadline_world_date", { ascending: true }).order("created_at", { ascending: true }).returns<ProposalRow[]>();
      if (error) throw error;
      response.status(200).json({ worldDate, queue: data ?? [] });
      return;
    }
    if (request.method === "POST") {
      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
      const action = typeof body.action === "string" ? body.action : "";
      const proposal = await proposalById(admin, proposalId);
      if (!proposal || proposal.review_route !== "ADMIN") {
        response.status(404).json({ error: "ADMIN_REVIEW_NOT_FOUND" });
        return;
      }
      if (action !== "ACCEPT" && action !== "REJECT" && action !== "CANCEL") {
        response.status(400).json({ error: "INVALID_ADMIN_ACTION" });
        return;
      }
      if (action === "CANCEL") {
        const { error } = await admin.rpc("tlr_admin_cancel_diplomatic_proposal", {
          p_proposal_id: proposalId,
          p_world_date: worldDate,
          p_admin_subject: session.sub,
          p_admin_kind: session.kind,
        });
        if (error) throw error;
        response.status(200).json({ ok: true, status: "CANCELLED", reviewedBy: session.kind });
        return;
      }
      const status = action === "ACCEPT" ? "ACCEPTED" : "REJECTED";
      const { data, error } = await admin.rpc("tlr_admin_respond_diplomatic_proposal", {
        p_proposal_id: proposalId,
        p_response: status,
        p_world_date: worldDate,
        p_admin_subject: session.sub,
        p_admin_kind: session.kind,
      });
      if (error) throw error;
      response.status(200).json({ ok: true, status, agreementId: data, reviewedBy: session.kind });
      return;
    }
    response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    response.status(500).json({ error: databaseErrorCode(error) });
  }
}
