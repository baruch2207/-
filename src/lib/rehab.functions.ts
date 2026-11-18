import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { seedPatients } from "./fixtures";
import { reportSchema, confirmReport, reportText } from "./rehabReport";
import type { Json } from "@/integrations/supabase/types";

export const listRehabReports = createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {data:roles,error:roleError}=await context.supabase.from("user_roles").select("role").eq("user_id",context.userId);
  if(roleError || !roles?.some(r=>r.role==="staff" || r.role==="admin")) throw new Error("נדרשת הרשאת צוות");
  const {data,error}=await context.supabase.from("demo_rehab_reports").select("payload").order("signed_at",{ascending:false}).limit(100);
  if(error) throw new Error("לא ניתן לקרוא דוחות מהענן");
  return {reports:(data??[]).flatMap(row=>{const parsed=reportSchema.safeParse(row.payload);return parsed.success ? [parsed.data] : [];})};
});
export const saveRehabReport = createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>reportSchema.parse(input)).handler(async({context,data})=>{
    const {data:roles,error:roleError}=await context.supabase.from("user_roles").select("role").eq("user_id",context.userId);
    if(roleError || !roles?.some(r=>r.role==="staff" || r.role==="admin")) throw new Error("נדרשת הרשאת צוות");
    const patient=seedPatients.find(p=>p.id===data.patientId);
    if(!patient || data.verification!=="staged") throw new Error("ניתן לאשר טיוטת דמו בלבד");
    const {data:existing,error:readError}=await context.supabase.from("demo_rehab_reports").select("payload,signed_by").eq("id",data.id).maybeSingle();
    if(readError) throw new Error("לא ניתן לבדוק שמירה קודמת");
    if(existing) {
      if(existing.signed_by!==context.userId) throw new Error("דוח זה שייך למאשר אחר");
      return {report:reportSchema.parse(existing.payload)};
    }
    const confirmed=confirmReport({...data,recorder:null},context.userId);
    const {data:saved,error}=await context.supabase.from("demo_rehab_reports").insert({id:data.id,patient_id:patient.id,session_id:data.sessionId,episode_id:data.episodeId,payload:confirmed as unknown as Json,report_text:data.editedText ?? reportText(confirmed,patient.alias),signed_by:context.userId}).select("payload").single();
    if(error?.code==="23505") {
      const {data:retry}=await context.supabase.from("demo_rehab_reports").select("payload,signed_by").eq("id",data.id).single();
      if(retry?.signed_by===context.userId) return {report:reportSchema.parse(retry.payload)};
    }
    if(error || !saved) throw new Error("הדוח לא נשמר בענן; הטיוטה נשארה במכשיר");
    return {report:reportSchema.parse(saved.payload)};
  });