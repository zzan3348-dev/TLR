import type { ApiRequest, ApiResponse } from "../../server/types.js";
import { getAdminClient, getServerEnv } from "../../server/auth.js";
import { requireAdminSession } from "../../server/adminAuth.js";
import { cleanPositiveNumber, cleanText, researchDatabaseError, researchWorldDate } from "../../server/research.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  const session = requireAdminSession(request,response); if (!session) return;
  const env = getServerEnv(); if (!env) { response.status(503).json({ error: "RESEARCH_SERVER_NOT_CONFIGURED" }); return; }
  const admin = getAdminClient(env);
  try {
    const worldDate = await researchWorldDate(admin);
    if (request.method === "GET") {
      const [projects,economies,settings] = await Promise.all([
        admin.from("research_projects").select("*").order("created_at", { ascending: false }).limit(300),
        admin.from("country_economies").select("country_key,research_points,research_income_per_period").order("country_key"),
        admin.from("research_settings").select("*").eq("singleton",true).single(),
      ]);
      const failed=[projects,economies,settings].find((result)=>result.error); if (failed?.error) throw failed.error;
      response.status(200).json({ worldDate, projects: projects.data ?? [], economies: economies.data ?? [], settings: settings.data }); return;
    }
    if (request.method !== "POST") { response.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }
    const body=request.body && typeof request.body === "object" ? request.body as Record<string,unknown> : {};
    const action=cleanText(body.action,40), projectId=cleanText(body.projectId,80), note=cleanText(body.note,1000);
    if (action === "APPROVE") {
      const durationDays=cleanPositiveNumber(body.durationDays); if (!projectId || !durationDays) { response.status(400).json({error:"INVALID_RESEARCH_REVIEW"}); return; }
      const {data,error}=await admin.rpc("tlr_approve_research_project",{p_project:projectId,p_duration_days:Math.round(durationDays),p_admin:session.sub,p_world_date:worldDate,p_notes:note}); if(error) throw error;
      response.status(200).json({ok:true,status:data}); return;
    }
    if (["REJECT","FORCE_COMPLETE","CANCEL"].includes(action)) {
      if(!projectId){response.status(400).json({error:"INVALID_RESEARCH_REVIEW"});return;}
      const status=action === "REJECT" ? "REJECTED" : action === "FORCE_COMPLETE" ? "COMPLETED" : "CANCELLED";
      const patch:Record<string,unknown>={status,updated_at:new Date().toISOString()};
      if(status==="REJECTED"){patch.rejection_reason=note;patch.rejected_world_date=worldDate;}
      if(status==="COMPLETED")patch.completed_world_date=worldDate;
      if(status==="CANCELLED")patch.cancelled_world_date=worldDate;
      const {data:project,error:projectError}=await admin.from("research_projects").update(patch).eq("id",projectId).select("country_key").single(); if(projectError) throw projectError;
      await admin.from("research_audit_logs").insert({project_id:projectId,country_key:project.country_key,actor_subject:session.sub,action,details:{note},world_date:worldDate});
      response.status(200).json({ok:true,status}); return;
    }
    if(action === "ADJUST_END_DATE"){
      const completionDate=cleanText(body.completionDate,10);
      if(!projectId || !/^\d{4}-\d{2}-\d{2}$/.test(completionDate)){response.status(400).json({error:"INVALID_RESEARCH_END_DATE"});return;}
      const {data:project,error}=await admin.from("research_projects")
        .update({scheduled_completion_world_date:completionDate,updated_at:new Date().toISOString()})
        .eq("id",projectId).eq("status","ACTIVE").select("country_key").single();
      if(error) throw error;
      await admin.from("research_audit_logs").insert({project_id:projectId,country_key:project.country_key,actor_subject:session.sub,action,details:{completionDate,note},world_date:worldDate});
      response.status(200).json({ok:true,scheduledCompletionWorldDate:completionDate});return;
    }
    if(action === "ADJUST_POINTS"){
      const countryKey=cleanText(body.countryKey,40); const amount=typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : null;
      if(!countryKey || amount===null){response.status(400).json({error:"INVALID_RESEARCH_ADJUSTMENT"});return;}
      const {data:row,error:rowError}=await admin.from("country_economies").select("research_points").eq("country_key",countryKey).maybeSingle(); if(rowError) throw rowError;
      const next=Math.max(0,Number(row?.research_points ?? 0)+amount);
      const {error}=await admin.from("country_economies").upsert({country_key:countryKey,research_points:next},{onConflict:"country_key"}); if(error) throw error;
      await admin.from("research_admin_adjustments").insert({country_key:countryKey,amount,resulting_balance:next,reason:note,actor_subject:session.sub,world_date:worldDate});
      await admin.from("research_audit_logs").insert({country_key:countryKey,actor_subject:session.sub,action,details:{amount,balance:next,note},world_date:worldDate});
      response.status(200).json({ok:true,balance:next});return;
    }
    response.status(400).json({error:"INVALID_ADMIN_ACTION"});
  } catch(error){response.status(409).json({error:researchDatabaseError(error)});}
}
