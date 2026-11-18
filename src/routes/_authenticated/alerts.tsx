import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { setState, useDemo } from "@/lib/store";
import { listCloudAlerts, updateCloudAlertStatus } from "@/lib/cloud.functions";
import type { AlertPriority, AlertStatus } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({
    meta: [
      { title: "אורי | ביחד – יומן התראות (דמו)" },
      { name: "description", content: "יומן התראות מרכזי עם סינון ועדכון סטטוס – נתונים סינתטיים בלבד." },
      { property: "og:title", content: "אורי | ביחד – יומן התראות" },
      { property: "og:description", content: "יומן התראות דמו – נתונים סינתטיים בלבד." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlertsScreen,
});

const statusLabel: Record<AlertStatus, string> = { open: "פתוח", acknowledged: "אושר", resolved: "טופל" };
const statusStyle: Record<AlertStatus, string> = {
  open: "bg-destructive-soft text-destructive",
  acknowledged: "bg-warning-soft text-warning",
  resolved: "bg-success-soft text-success",
};
const priorityLabel: Record<AlertPriority, string> = { critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך" };
const priorityStyle: Record<AlertPriority, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-warning-soft text-warning",
  medium: "bg-secondary text-secondary-foreground",
  low: "bg-muted text-muted-foreground",
};

function AlertsScreen() {
  const s = useDemo();
  const [fPatient, setFPatient] = useState<string>("all");
  const [fStatus, setFStatus] = useState<AlertStatus | "all">("all");
  const [fPriority, setFPriority] = useState<AlertPriority | "all">("all");

  const cloudAlerts = useQuery({ queryKey: ["cloud-alerts"], queryFn: () => listCloudAlerts(), retry: false, refetchInterval: 15_000 });
  const cloudFailed = cloudAlerts.isError;

  useEffect(() => {
    if (cloudAlerts.data) setState((st) => ({ ...st, alerts: cloudAlerts.data }));
  }, [cloudAlerts.data]);

  const filtered = s.alerts
    .filter((a) => (fPatient === "all" || a.patientId === fPatient))
    .filter((a) => (fStatus === "all" || a.status === fStatus))
    .filter((a) => (fPriority === "all" || a.priority === fPriority))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const openCount = s.alerts.filter((a) => a.status === "open").length;
  const criticalOpen = s.alerts.filter((a) => a.status === "open" && a.priority === "critical").length;

  const setAlertStatus = (id: string, status: AlertStatus) => {
    setState((st) => ({ ...st, alerts: st.alerts.map((a) => (a.id === id ? { ...a, status } : a)) }));
    updateCloudAlertStatus({ data: { id, status } }).catch(() => {});
  };

  const chip = (active: boolean) =>
    `min-h-11 rounded-xl px-4 text-lg ${active ? "bg-primary text-primary-foreground" : "border bg-card"}`;

  return (
    <main dir="rtl" className="min-h-screen bg-calm">
      <div className="bg-warning-soft px-4 py-2 text-center text-base">
        סימולציה – יומן התראות עם נתונים סינתטיים בלבד · {cloudFailed ? "מצב מקומי (הענן לא זמין)" : "מסונכרן לענן"}
      </div>
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl text-primary">יומן התראות</h1>
            <p className="mt-1 text-lg text-muted-foreground">
              {s.alerts.length} התראות סה"כ · {openCount} פתוחות · {criticalOpen} קריטיות פתוחות
            </p>
          </div>
          <Link to="/staff" className="min-h-11 rounded-xl border bg-card px-4 py-2 text-lg">← למסך הצוות</Link>
        </header>

        <section aria-label="סינון התראות" className="space-y-3 rounded-3xl bg-card p-4 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">מטופל:</span>
            <button onClick={() => setFPatient("all")} aria-pressed={fPatient === "all"} className={chip(fPatient === "all")}>הכל</button>
            {s.patients.map((x) => (
              <button key={x.id} onClick={() => setFPatient(x.id)} aria-pressed={fPatient === x.id} className={chip(fPatient === x.id)}>
                {x.alias}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">סטטוס:</span>
            <button onClick={() => setFStatus("all")} aria-pressed={fStatus === "all"} className={chip(fStatus === "all")}>הכל</button>
            {(Object.keys(statusLabel) as AlertStatus[]).map((st) => (
              <button key={st} onClick={() => setFStatus(st)} aria-pressed={fStatus === st} className={chip(fStatus === st)}>
                {statusLabel[st]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">עדיפות:</span>
            <button onClick={() => setFPriority("all")} aria-pressed={fPriority === "all"} className={chip(fPriority === "all")}>הכל</button>
            {(Object.keys(priorityLabel) as AlertPriority[]).map((pr) => (
              <button key={pr} onClick={() => setFPriority(pr)} aria-pressed={fPriority === pr} className={chip(fPriority === pr)}>
                {priorityLabel[pr]}
              </button>
            ))}
          </div>
        </section>

        <p role="status" className="text-lg text-muted-foreground">מוצגות {filtered.length} התראות</p>

        <ul className="space-y-3">
          {filtered.length === 0 && (
            <li className="rounded-3xl bg-card p-8 text-center text-lg text-muted-foreground shadow-soft">
              אין התראות התואמות את הסינון.
            </li>
          )}
          {filtered.map((a) => {
            const patient = s.patients.find((x) => x.id === a.patientId);
            return (
              <li key={a.id} className="rounded-3xl bg-card p-5 shadow-soft">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-sm ${priorityStyle[a.priority]}`}>{priorityLabel[a.priority]}</span>
                  <span className={`rounded-full px-3 py-1 text-sm ${statusStyle[a.status]}`}>{statusLabel[a.status]}</span>
                  <span className="font-semibold">{patient?.alias ?? a.patientId}</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString("he-IL")} · אל: {a.targetRole}
                  </span>
                </div>
                <p className="mt-2 text-xl">"{a.quote}"</p>
                <p className="mt-1 text-muted-foreground">{a.why}</p>
                <p className="text-sm text-muted-foreground">אי-ודאות: {a.uncertainty}</p>
                {a.clinicianContext && <p className="mt-1 text-sm">הקשר קליני: {a.clinicianContext}</p>}
                <div className="mt-3 flex flex-wrap gap-2" aria-label="שינוי סטטוס התראה">
                  {(Object.keys(statusLabel) as AlertStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => setAlertStatus(a.id, st)}
                      disabled={a.status === st}
                      className="min-h-11 rounded-xl border px-4 text-base disabled:opacity-40"
                    >
                      {statusLabel[st]}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
