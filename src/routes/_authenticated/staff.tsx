import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMemory, setState, useDemo } from "@/lib/store";
import { protocolById } from "@/lib/protocols";
import { getStaffAccess, grantDemoStaffRole, listCloudAlerts, updateCloudAlertStatus } from "@/lib/cloud.functions";
import type { AlertStatus } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({
    meta: [
      { title: "אורי | ביחד – מסך צוות (דמו)" },
      { name: "description", content: "תצוגת צוות עם נתונים סינתטיים: התראות, בסיס ראיות והחלטות מנוע השיחה." },
      { property: "og:title", content: "אורי | ביחד – מסך צוות" },
      { property: "og:description", content: "דמו בלבד – נתונים סינתטיים, ללא מטופלים אמיתיים." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffScreen,
});

const statusLabel: Record<AlertStatus, string> = { open: "פתוח", acknowledged: "אושר", resolved: "טופל" };
const statusStyle: Record<AlertStatus, string> = {
  open: "bg-destructive-soft text-destructive",
  acknowledged: "bg-warning-soft text-warning",
  resolved: "bg-success-soft text-success",
};
const priorityLabel = { critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך" } as const;

function StaffScreen() {
  const s = useDemo();
  const queryClient = useQueryClient();
  const [pid, setPid] = useState(s.activePatientId);
  const p = s.patients.find((x) => x.id === pid) ?? s.patients[0];

  const access = useQuery({ queryKey: ["staff-access"], queryFn: () => getStaffAccess(), retry: false });
  const grant = useMutation({
    mutationFn: () => grantDemoStaffRole(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["staff-access"] }),
  });
  const isStaff = access.data?.isStaff === true;

  const cloudAlerts = useQuery({
    queryKey: ["cloud-alerts"],
    queryFn: () => listCloudAlerts(),
    enabled: isStaff,
    retry: false,
    refetchInterval: 15_000, // bedside help requests show up without a reload
  });
  const cloudFailed = cloudAlerts.isError;

  useEffect(() => {
    if (cloudAlerts.data) setState((st) => ({ ...st, alerts: cloudAlerts.data }));
  }, [cloudAlerts.data]);

  if (access.isLoading) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-calm p-4">
        <p className="text-xl text-muted-foreground">בודק הרשאות…</p>
      </main>
    );
  }

  if (!isStaff) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-calm p-4">
        <div className="max-w-md rounded-3xl bg-card p-8 text-center shadow-soft">
          <h1 className="text-2xl text-primary">אין הרשאת צוות</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            החשבון מחובר, אך אין לו תפקיד צוות. בסביבת הדמו ניתן להעניק לעצמך תפקיד צוות סינתטי.
          </p>
          <button
            onClick={() => grant.mutate()}
            disabled={grant.isPending}
            className="mt-6 min-h-14 w-full rounded-2xl bg-primary px-6 text-xl text-primary-foreground disabled:opacity-50"
          >
            הענקת תפקיד צוות – דמו
          </button>
          {grant.isError && <p role="alert" className="mt-3 text-destructive">ההענקה נכשלה – נסו שוב.</p>}
        </div>
      </main>
    );
  }

  if (!p) return null;
  const mem = getMemory(s, p.id);
  const alerts = s.alerts.filter((a) => a.patientId === p.id);
  const rationales = mem.messages.filter((m) => m.from === "bot" && m.rationale).slice(-6).reverse();

  const setAlertStatus = (id: string, status: AlertStatus) => {
    setState((st) => ({ ...st, alerts: st.alerts.map((a) => (a.id === id ? { ...a, status } : a)) }));
    updateCloudAlertStatus({ data: { id, status } }).catch(() => {});
  };

  return (
    <main dir="rtl" className="min-h-screen bg-calm">
      <div className="bg-warning-soft px-4 py-2 text-center text-base">
        דמו צוות – נתונים סינתטיים בלבד, אין מידע מזוהה · {cloudFailed ? "מצב מקומי (הענן לא זמין)" : "מסונכרן לענן"}
      </div>
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <h1 className="text-3xl text-primary">מסך צוות</h1>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="בחירת מטופל">
          {s.patients.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={x.id === p.id}
              onClick={() => setPid(x.id)}
              className={`min-h-12 rounded-2xl px-4 text-lg ${x.id === p.id ? "bg-primary text-primary-foreground" : "bg-card border"}`}
            >
              {x.alias}, {x.age}
            </button>
          ))}
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-card p-6 shadow-soft">
            <h2 className="text-xl text-primary">פרופיל (סינתטי)</h2>
            <p className="mt-2 text-lg">{p.alias} · גיל {p.age} · {p.condition}</p>
            <p className="text-muted-foreground">שלב: {p.caseManagerState}</p>
            {p.goal && <p className="mt-2">🎯 מטרה מאושרת: {p.goal.text} (אישר/ה: {p.goal.approvedBy})</p>}
            {p.clinicianNote && (
              <p className="mt-2 rounded-2xl bg-secondary p-3">הערת {p.clinicianNote.role}: {p.clinicianNote.text}</p>
            )}
            <h3 className="mt-4 font-semibold">מדדים מאושרים</h3>
            <ul className="mt-1 list-disc pr-5">
              {p.metrics.map((m) => <li key={m.id}>{m.label}: {m.value} ({m.confirmedBy})</li>)}
            </ul>
            <h3 className="mt-4 font-semibold">הישגים מאושרים</h3>
            <ul className="mt-1 list-disc pr-5">
              {p.achievements.length ? p.achievements.map((a) => <li key={a.id}>{a.text} ({a.approvedBy})</li>) : <li>אין עדיין</li>}
            </ul>
          </div>

          <div className="rounded-3xl bg-card p-6 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl text-primary">התראות ({alerts.length})</h2>
              <Link to="/alerts" className="rounded-xl border px-3 py-1 text-base text-primary">יומן מלא ←</Link>
            </div>
            <ul className="mt-3 space-y-3">
              {alerts.length === 0 && <li className="text-muted-foreground">אין התראות למטופל זה.</li>}
              {alerts.map((a) => (
                <li key={a.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-sm ${statusStyle[a.status]}`}>{statusLabel[a.status]}</span>
                    <span className="rounded-full bg-secondary px-3 py-1 text-sm">{priorityLabel[a.priority]}</span>
                    <span className="text-sm text-muted-foreground">אל: {a.targetRole}</span>
                  </div>
                  <p className="mt-2 text-lg">"{a.quote}"</p>
                  <p className="text-sm text-muted-foreground">{a.why} · {a.uncertainty}</p>
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
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <h2 className="text-xl text-primary">בסיס ראיות – פרוטוקולים משויכים</h2>
          <ul className="mt-3 space-y-3">
            {p.protocolIds.length === 0 && <li className="text-muted-foreground">אין פרוטוקולים משויכים – שיחה כללית בלבד.</li>}
            {p.protocolIds.map((id) => {
              const pr = protocolById(id);
              if (!pr) return null;
              return (
                <li key={id} className="rounded-2xl border p-4">
                  <p className="font-semibold">{pr.name} <span className="text-sm text-muted-foreground">(גרסה {pr.version})</span></p>
                  <p className="mt-1 text-sm">גבולות: {pr.boundaryTags.join(" · ")}</p>
                  <p className="mt-1 text-sm text-destructive">אין לעשות: {pr.doNot.join(" · ")}</p>
                  {pr.citations.map((c) => (
                    <p key={c.url} className="mt-1 text-sm">
                      <a href={c.url} target="_blank" rel="noreferrer" className="text-primary underline">{c.title}</a>
                      {" "}– {c.evidence}. {c.note}
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <h2 className="text-xl text-primary">החלטות מנוע השיחה (שקיפות)</h2>
          <ul className="mt-3 space-y-2">
            {rationales.length === 0 && <li className="text-muted-foreground">עוד לא נערכה שיחה עם מטופל זה.</li>}
            {rationales.map((m) => (
              <li key={m.id} className="rounded-2xl bg-secondary p-3 text-sm">
                <span className="font-semibold">{m.rationale?.rule}</span> · נושא: {m.rationale?.topic} · מקור: {m.rationale?.source}
                {m.rationale?.protocolId && <> · פרוטוקול: {m.rationale.protocolId}</>}
                {m.rationale?.technique && <> · טכניקה: {m.rationale.technique}</>}
                <p className="mt-1 text-muted-foreground">"{m.text.slice(0, 120)}{m.text.length > 120 ? "…" : ""}"</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
