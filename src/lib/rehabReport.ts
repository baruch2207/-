import { z } from "zod";
import { stations, demoYesterday } from "./physioProtocol";

export const eventSchema = z.object({
  id: z.string().uuid(), patientId: z.string(), episodeId: z.string(), sessionId: z.string().uuid(),
  stationId: z.string(), activityId: z.string(), observedDistanceMeters: z.number().int().positive().max(1000).nullable(),
  support: z.string().nullable(), resultType: z.enum(["performed", "not_done"]),
  steps: z.number().int().positive().max(500).optional(), notes: z.string().max(500).optional(),
  timestamp: z.string().datetime(), recorder: z.string().nullable(),
  staffVerification: z.enum(["staged", "local-demo", "staff-confirmed"]),
  source: z.literal("staff-observed"), revision: z.number().int().positive(),
}).strict().superRefine((e, ctx) => {
  const st = stations.find(s => s.id === e.stationId);
  if (!st || e.activityId !== e.stationId) { ctx.addIssue({code:"custom", message:"Unknown activity"}); return; }
  if(e.resultType === "not_done") {
    if(e.support !== null || e.observedDistanceMeters !== null || e.steps !== undefined) ctx.addIssue({code:"custom",message:"No invented performance"});
  } else {
    if (!e.support || !st.assists.includes(e.support)) ctx.addIssue({code:"custom",message:"Invalid assistance"});
    if (st.distances ? !st.distances.includes(e.observedDistanceMeters ?? -1) : e.observedDistanceMeters !== null) ctx.addIssue({code:"custom",message:"Invalid distance"});
    if(e.steps !== undefined && st.id !== "stairs") ctx.addIssue({code:"custom",message:"Steps only for stairs"});
  }
});
export const observationsSchema = z.object({
  participation: z.enum(["שיתוף פעולה תקין", "שיתוף פעולה חלקי", "סירב"]).optional(),
  pain: z.enum(["כאב במהלך תרגול", "ללא תלונה על כאב"]).optional(),
  fatigue: z.enum(["נצפתה עייפות", "לא נצפתה עייפות"]).optional(),
  fear: z.enum(["דיווח על חשש מנפילה", "דיווח שאין חשש מנפילה"]).optional(),
  effort: z.enum(["מאמץ קל", "מאמץ בינוני", "מאמץ רב"]).optional(),
}).strict();
export const reportSchema = z.object({
  id: z.string().uuid(), patientId: z.string(), sessionId: z.string().uuid(), episodeId: z.string(),
  startedAt: z.string().datetime(), events: z.array(eventSchema).min(1).max(60), observations: observationsSchema,
  editedText: z.string().max(12000).optional(), verification: z.enum(["staged","local-demo","staff-confirmed"]),
  recorder: z.string().nullable(), revision: z.number().int().positive(),
}).strict().superRefine((r,ctx)=> {
  if(new Set(r.events.map(e=>e.id)).size !== r.events.length) ctx.addIssue({code:"custom",message:"Duplicate event"});
  if(r.events.some(e=>e.patientId!==r.patientId || e.sessionId!==r.sessionId || e.episodeId!==r.episodeId)) ctx.addIssue({code:"custom",message:"Mismatched session"});
});
export type RehabEvent = z.infer<typeof eventSchema>;
export type RehabReport = z.infer<typeof reportSchema>;
export type Observations = z.infer<typeof observationsSchema>;
export type Performance = { observedDistanceMeters: number | null; support: string };

export function previousPerformance(reports: RehabReport[], patientId: string, stationId: string): RehabEvent | undefined {
  return reports.filter(r=>r.patientId===patientId && r.verification==="staff-confirmed")
    .flatMap(r=>r.events).filter(e=>e.stationId===stationId && e.resultType==="performed" && e.staffVerification==="staff-confirmed")
    .sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0];
}
export function examplePerformance(patientId: string, stationId: string): Performance {
  const st=stations.find(s=>s.id===stationId) ?? stations[0];
  if(!st) return {observedDistanceMeters:null,support:""};
  const i=demoYesterday(patientId,st), count=st.distances?.length ?? 1;
  return {observedDistanceMeters:st.distances?.[i % count] ?? null,support:st.assists[Math.floor(i/count)] ?? st.assists[0] ?? ""};
}
export function performanceChoices(stationId: string, base: Performance) {
  const st=stations.find(s=>s.id===stationId);
  if(!st) return [];
  const choices: {label:string; value:Performance}[]=[{label:"כמו בפעם הקודמת",value:base}];
  const di=st.distances?.indexOf(base.observedDistanceMeters ?? -1) ?? -1;
  if(st.distances && di>=0) for(const delta of [-1,1]) {
    const d=st.distances[di+delta];
    if(d!==undefined) choices.push({label:`${d} מ׳ · ${base.support}`,value:{...base,observedDistanceMeters:d}});
  }
  const ai=st.assists.indexOf(base.support);
  if(ai>=0) for(const delta of [-1,1]) {
    const support=st.assists[ai+delta];
    if(support) choices.push({label:`${base.observedDistanceMeters===null ? "" : `${base.observedDistanceMeters} מ׳ · `}${support}`,value:{...base,support}});
  }
  return choices;
}
export function eventLine(e: RehabEvent) {
  const st=stations.find(s=>s.id===e.stationId);
  if(!st) return "";
  if(e.resultType==="not_done") return `${st.name}: לא בוצע${e.notes ? ` — ${e.notes}` : ""}.`;
  return `${st.verb}${e.observedDistanceMeters!==null ? ` למרחק ${e.observedDistanceMeters} מ׳` : ""}${e.steps ? `, ${e.steps} מדרגות` : ""}, ${e.support}${e.notes ? ` — ${e.notes}` : ""}.`;
}
export function reportText(r: RehabReport, alias: string, short=false) {
  const lines=["סימולציה בלבד — דוח פיזיותרפיה סינתטי",`מטופל דמו: ${alias} | ${new Date(r.startedAt).toLocaleString("he-IL")}`,...r.events.map(eventLine)];
  const o=r.observations;
  if(o.participation) lines.push(`תצפית צוות: ${o.participation}.`);
  if(o.fatigue) lines.push(`תצפית צוות: ${o.fatigue}.`);
  if(o.pain) lines.push(`דיווח המטופל במהלך המפגש: ${o.pain}.`);
  if(o.fear) lines.push(`דיווח המטופל: ${o.fear}.`);
  if(o.effort) lines.push(`דיווח המטופל על מאמץ: ${o.effort}.`);
  if(!short) lines.push(r.verification==="staff-confirmed" ? "אושר בידי צוות מחובר — נתוני דמו בלבד, אינו דוח קליני." : r.verification==="local-demo" ? "נשמר מקומית כהדגמה בלבד — ללא אישור צוות." : "טיוטה — טרם אושרה בידי צוות.");
  return lines.join("\n");
}
export function confirmReport(r: RehabReport, recorder: string | null): RehabReport {
  if(r.verification!=="staged") return r;
  const verification=recorder ? "staff-confirmed" : "local-demo";
  return {...r,verification,recorder,events:r.events.map(e=>({...e,recorder,staffVerification:verification}))};
}