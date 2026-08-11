import type { ApiRequest, ApiResponse } from "../../types.js";
import { requireNaviAdminActor, requireNaviAdminClient } from "../../naviAuth.js";
import { cleanPositiveNumber, cleanText, researchDatabaseError, researchWorldDate } from "../../research.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const admin = requireNaviAdminClient(request, response);
  if (!admin) return;
  const actor = await requireNaviAdminActor(request, response, admin);
  if (!actor) return;
  try {
    const worldDate = await researchWorldDate(admin);
    if (request.method === "GET") {
      const { data, error } = await admin
        .from("research_projects")
        .select("*")
        .in("status", ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "ACTIVE"])
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      response.status(200).json({ worldDate, projects: data ?? [] });
      return;
    }
    if (request.method !== "POST") {
      response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
      return;
    }
    const body = request.body && typeof request.body === "object"
      ? request.body as Record<string, unknown>
      : {};
    const action = cleanText(body.action, 40);
    const projectId = cleanText(body.projectId, 80);
    const note = cleanText(body.note, 1000);
    if (!projectId) {
      response.status(400).json({ error: "INVALID_RESEARCH_REVIEW" });
      return;
    }
    if (action === "APPROVE") {
      const durationDays = cleanPositiveNumber(body.durationDays);
      if (!durationDays) {
        response.status(400).json({ error: "INVALID_RESEARCH_REVIEW" });
        return;
      }
      const { data, error } = await admin.rpc("tlr_approve_research_project", {
        p_project: projectId,
        p_duration_days: Math.round(durationDays),
        p_admin: actor.profileId,
        p_world_date: worldDate,
        p_notes: note,
      });
      if (error) throw error;
      response.status(200).json({ ok: true, status: data });
      return;
    }
    if (["REJECT", "FORCE_COMPLETE", "CANCEL"].includes(action)) {
      const status = action === "REJECT" ? "REJECTED" : action === "FORCE_COMPLETE" ? "COMPLETED" : "CANCELLED";
      const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "REJECTED") {
        update.rejection_reason = note;
        update.rejected_world_date = worldDate;
      } else if (status === "COMPLETED") {
        update.completed_world_date = worldDate;
      } else {
        update.cancelled_world_date = worldDate;
      }
      const { data: project, error } = await admin
        .from("research_projects")
        .update(update)
        .eq("id", projectId)
        .select("country_key")
        .single<{ country_key: string }>();
      if (error) throw error;
      const audit = await admin.from("research_audit_logs").insert({
        project_id: projectId,
        country_key: project.country_key,
        actor_subject: actor.profileId,
        action,
        details: { note, source: "NAVI" },
        world_date: worldDate,
      });
      if (audit.error) throw audit.error;
      response.status(200).json({ ok: true, status });
      return;
    }
    if (action === "ADJUST_END_DATE") {
      const completionDate = cleanText(body.completionDate, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(completionDate)) {
        response.status(400).json({ error: "INVALID_RESEARCH_END_DATE" });
        return;
      }
      const { data: project, error } = await admin
        .from("research_projects")
        .update({ scheduled_completion_world_date: completionDate, updated_at: new Date().toISOString() })
        .eq("id", projectId)
        .eq("status", "ACTIVE")
        .select("country_key")
        .single<{ country_key: string }>();
      if (error) throw error;
      const audit = await admin.from("research_audit_logs").insert({
        project_id: projectId,
        country_key: project.country_key,
        actor_subject: actor.profileId,
        action,
        details: { completionDate, note, source: "NAVI" },
        world_date: worldDate,
      });
      if (audit.error) throw audit.error;
      response.status(200).json({ ok: true, status: "ACTIVE", scheduledCompletionWorldDate: completionDate });
      return;
    }
    response.status(400).json({ error: "UNKNOWN_RESEARCH_ADMIN_ACTION" });
  } catch (error) {
    response.status(409).json({ error: researchDatabaseError(error) });
  }
}
