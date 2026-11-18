import { reportSchema, type RehabReport } from "./rehabReport";
const key="ori-rehab-reports-v1";
export function readLocalReports(): RehabReport[] {
  try { const raw:unknown=JSON.parse(localStorage.getItem(key)??"[]"); return Array.isArray(raw) ? raw.flatMap(r=>{const p=reportSchema.safeParse(r);return p.success ? [p.data] : [];}) : []; } catch {return [];}
}
export function writeLocalReports(reports:RehabReport[]) {
  try {localStorage.setItem(key,JSON.stringify(reports.slice(0,100)));return true;} catch {return false;}
}