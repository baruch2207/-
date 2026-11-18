import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { setState, useDemo } from "@/lib/store";
import { recordCloudOutcome } from "@/lib/cloud.functions";
import { supabase } from "@/integrations/supabase/client";
import { stations, ladder, demoYesterday, todayOptions } from "@/lib/physioProtocol";
import type { StationOutcome } from "@/lib/types";

export const Route = createFileRoute("/station")({
  head: () => ({
    meta: [
      { title: "אורי | ביחד – תחנת שיקום" },
      { name: "description", content: "מסך פתיחה ליד כל מכשיר: הישג אתמול ושלוש אפשרויות להיום לפי פרוטוקול ההתקדמות. דמו סינתטי." },
      { property: "og:title", content: "אורי | ביחד – תחנת שיקום" },
      { property: "og:description", content: "הישג אתמול ובחירת תרגול היום לפי הפרוטוקול – דמו בלבד." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StationScreen,
});

const outcomeLabel: Record<StationOutcome["outcome"], string> = { completed: "⬆️ התקדם", adapted: "🔁 חזר על אתמול", not_done: "⬇️ הקלה" };

function StationScreen() {
  const s = useDemo();
  const [pid, setPid] = useState(s.activePatientId);
  const [sid, setSid] = useState<string | null>(null);
  const [physioPresent, setPhysioPresent] = useState(false);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const p = s.patients.find((x) => x.id === pid) ?? s.patients[0];
  const st = stations.find((x) => x.id === sid);

  const yesterdayIdx = (() => {
    if (!st || !p) return 0;
    const last = s.outcomes.find((o) => o.patientId === p.id && o.station.startsWith(st.name + " | "));
    if (last) { const i = ladder(st).indexOf(last.station.split(" | ")[1] ?? ""); if (i >= 0) return i; }
    return demoYesterday(p.id, st);
  })();

  const record = (outcome: StationOutcome["outcome"], text: string) => {
    if (!physioPresent || !p || !st) return;
    const station = `${st.name} | ${text}`;
    setState((x) => ({ ...x, outcomes: [{ id: Math.random().toString(36).slice(2, 10), patientId: p.id, station, outcome, at: new Date().toISOString() }, ...x.outcomes] }));
    setSaved(`נשמר ✓ ${st.name}: ${text}`);
    setOpen(false);
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) recordCloudOutcome({ data: { patientId: p.id, station, outcome } }).catch(() => {});
    });
  };

  const opts = st ? todayOptions(yesterdayIdx, st) : null;

  return (
    <main dir="rtl" className="min-h-screen bg-calm">
      <div className="bg-warning-soft px-4 py-2 text-center text-base">דמו – תיעוד תרגול סינתטי בלבד</div>
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <h1 className="text-3xl text-primary">תחנת שיקום</h1>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="בחירת מטופל">
          {s.patients.map((x) => (
            <button key={x.id} role="tab" aria-selected={x.id === p?.id}
              onClick={() => { setPid(x.id); setSaved(null); setOpen(false); }}
              className={`min-h-12 rounded-2xl px-4 text-lg ${x.id === p?.id ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
              {x.alias}
            </button>
          ))}
        </div>

        <section aria-label="בחירת מכשיר" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stations.map((x) => (
            <button key={x.id} onClick={() => { setSid(x.id); setSaved(null); setOpen(false); }}
              className={`min-h-16 rounded-2xl p-2 text-lg font-semibold ${x.id === sid ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
              {x.name}
            </button>
          ))}
        </section>

        {!st && <p className="rounded-2xl bg-card p-4 text-lg">בחרו את המכשיר שלידו נמצאים עכשיו.</p>}

        {st && opts && (
          <section className="space-y-4 rounded-3xl bg-card p-6 shadow-soft">
            <h2 className="text-2xl text-primary">{st.name} – {p?.alias}</h2>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border p-4 text-xl">
              <input type="checkbox" checked={physioPresent} onChange={(e) => setPhysioPresent(e.target.checked)} className="h-6 w-6" />
              פיזיותרפיסט/ית נוכח/ת
            </label>

            {!physioPresent ? (
              <p role="status" className="rounded-2xl bg-warning-soft p-4 text-lg">המסך נפתח רק בנוכחות פיזיותרפיסט.</p>
            ) : (
              <>
                <p className="rounded-2xl bg-muted p-4 text-xl">
                  <span className="font-semibold">אתמול: </span>{st.verb} – {ladder(st)[yesterdayIdx]}
                </p>
                <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
                  className="min-h-16 w-full rounded-3xl bg-primary text-2xl font-semibold text-primary-foreground">
                  התרגול של היום
                </button>
                {open && (
                  <div className="grid gap-3">
                    <button onClick={() => record("completed", opts.advance.text)} className="min-h-20 rounded-3xl bg-success-soft p-3 text-xl font-semibold text-success">
                      ⬆️ התקדמות לפי הפרוטוקול: {opts.advance.text}
                    </button>
                    <button onClick={() => record("adapted", opts.repeat.text)} className="min-h-20 rounded-3xl bg-warning-soft p-3 text-xl font-semibold text-warning">
                      🔁 חזרה על אתמול: {opts.repeat.text}
                    </button>
                    <button onClick={() => record("not_done", opts.easier.text)} className="min-h-20 rounded-3xl bg-destructive-soft p-3 text-xl font-semibold text-destructive">
                      ⬇️ הקלה: {opts.easier.text}
                    </button>
                  </div>
                )}
              </>
            )}
            {saved && <p role="status" className="rounded-2xl bg-success-soft p-4 text-lg">{saved}</p>}
          </section>
        )}

        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <h2 className="text-xl text-primary">תוצאות שנרשמו ({s.outcomes.length})</h2>
          <ul className="mt-3 space-y-2">
            {s.outcomes.length === 0 && <li className="text-muted-foreground">עוד לא תועדו תוצאות.</li>}
            {s.outcomes.slice(0, 10).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 rounded-2xl border p-3 text-lg">
                <span className="font-semibold">{s.patients.find((x) => x.id === o.patientId)?.alias ?? o.patientId}</span>
                <span>{o.station}</span>
                <span>{outcomeLabel[o.outcome]}</span>
                <span className="text-sm text-muted-foreground">{new Date(o.at).toLocaleString("he-IL")}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
