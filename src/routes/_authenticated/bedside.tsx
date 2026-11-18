import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMemory, pushAlert, setState, useDemo } from "@/lib/store";
import { getStaffAccess, recordCloudAlert } from "@/lib/cloud.functions";
import { getSimliStatus } from "@/lib/simli.functions";
import { canStartPaidSession } from "@/lib/simliCore";
import { SimliAvatar } from "@/components/SimliAvatar";
import { respond, greeting } from "@/lib/engine";
import { QUIZ_TRIGGER } from "@/lib/questionnaire";
import { serverChat, type ServerChatResult } from "@/lib/serverChat";
import { speak, stopSpeech, listenOnce, type ListenStatus } from "@/lib/speech";
import { ORI_PHOTO } from "@/lib/avatarAdapter";
import { useFullscreen } from "@/lib/useFullscreen";
import { cn } from "@/lib/utils";
import {
  currentIndex, dailySchedule, evaluateCheckIn, greetingByHour, helpOptions, helpRequest, moodFaces,
  painOptions, progressSummary, sleepOptions, stayDay, uid, type CheckIn, type HelpKind, type Mood, type PainLevel, type Sleep,
} from "@/lib/ward";
import type { ChatMessage, DemoAlert, PatientMemory, PatientProfile } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/bedside")({
  head: () => ({
    meta: [
      { title: "אורי | ביחד – מסך המיטה" },
      { name: "description", content: "האפליקציה של המטופל במחלקה: שיחה עם אורי, סדר היום, התקדמות וקריאה לצוות. דמו סינתטי." },
      { property: "og:title", content: "אורי | ביחד – מסך המיטה" },
      { property: "og:description", content: "צד המטופל בזמן השהות במחלקה – סימולציה בלבד." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BedsideRoute,
});

function BedsideRoute() {
  const s = useDemo();
  const p = s.kiosk ? s.patients.find((x) => x.id === s.kiosk!.patientId) : undefined;
  if (s.kiosk && p) return <BedsideApp patient={p} liveAvatar={s.kiosk.liveAvatar} />;
  return <Launcher />;
}

// ---------------------------------------------------------------------------
// Staff launcher: pick a patient, choose avatar mode, hand the tablet over.
// ---------------------------------------------------------------------------

function Launcher() {
  const s = useDemo();
  const [pid, setPid] = useState(s.activePatientId);
  const [live, setLive] = useState(true);
  const [ack, setAck] = useState(false);
  const access = useQuery({ queryKey: ["staff-access"], queryFn: () => getStaffAccess(), retry: false });
  const isStaff = access.data?.isStaff === true;
  const simli = useQuery({ queryKey: ["simli-status"], queryFn: () => getSimliStatus(), retry: false, enabled: isStaff });
  const simliReady = simli.data ? canStartPaidSession(simli.data, true) : false;
  const caps = simli.data?.patientCaps;
  const useLive = live && simliReady;

  const handOver = () => {
    setState((st) => ({ ...st, activePatientId: pid, kiosk: { patientId: pid, liveAvatar: useLive, startedAt: new Date().toISOString() } }));
  };

  return (
    <main dir="rtl" className="min-h-screen bg-calm">
      <div className="bg-warning-soft px-4 py-2 text-center text-base">סימולציה – אין שימוש במטופלים אמיתיים</div>
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <h1 className="text-3xl text-primary">הכנת מסך המיטה למטופל</h1>
        <p className="text-lg text-muted-foreground">
          איש צוות מחובר מכין את הטאבלט ומוסר אותו למטופל. המטופל לא צריך סיסמה. כל בקשת עזרה או התראת בטיחות נשלחת לצוות.
        </p>

        {access.isLoading && <p>בודק הרשאות…</p>}
        {access.isError && <p role="alert" className="rounded-2xl bg-destructive-soft p-4 text-lg">לא ניתן לבדוק הרשאות צוות כרגע (אין חיבור לשרת). נסו שוב.</p>}
        {access.data && !isStaff && (
          <p role="alert" className="rounded-2xl bg-destructive-soft p-4 text-lg">
            נדרשת הרשאת צוות. היכנסו ל<Link to="/staff" className="underline">מסך הצוות</Link> והפעילו הרשאת דמו.
          </p>
        )}

        <section className="space-y-3 rounded-3xl bg-card p-6 shadow-soft" aria-label="בחירת מטופל">
          <h2 className="text-xl text-primary">1. מטופל (דמו)</h2>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {s.patients.map((x) => (
              <button key={x.id} role="radio" aria-checked={x.id === pid} onClick={() => setPid(x.id)}
                className={cn("min-h-12 rounded-2xl px-4 text-lg", x.id === pid ? "bg-primary text-primary-foreground" : "border bg-card")}>
                {x.alias} · {x.age}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-3xl bg-card p-6 shadow-soft" aria-label="אווטאר">
          <h2 className="text-xl text-primary">2. אורי במסך</h2>
          <label className="flex items-center gap-3 text-lg">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="h-6 w-6" />
            אווטאר וידאו חי עם שיחה קולית (Simli)
          </label>
          {live && simli.isLoading && <p>בודק את חיבור Simli…</p>}
          {live && simli.data && !simliReady && (
            <p className="rounded-xl bg-warning-soft p-3">
              Simli עדיין לא מוכן ({!simli.data.apiKeyConfigured ? "חסר מפתח בשרת" : "המפתח לא אושר כמוחלף"}). המטופל יקבל את תמונת אורי עם קול מהדפדפן, ללא עלות.
            </p>
          )}
          {live && simliReady && (
            <>
              <p className="text-base text-muted-foreground">
                כל שיחה מוגבלת בשרת ל־{caps?.maxSessionLength ?? 300} שניות ונסגרת אחרי {caps?.maxIdleTime ?? 60} שניות של שקט. כל שיחה נספרת כדקות בתשלום ב־Simli.
                {simli.data?.isDemoFace && " שימו לב: Face ID של אורי לא מוגדר – יוצגו פנים לדוגמה."}
              </p>
              <label className="flex items-start gap-3 text-base">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 h-6 w-6" />
                אני מאשר/ת שהמטופל יוכל לפתוח שיחות וידאו בתשלום במכשיר זה, עם נתוני דמו בלבד.
              </label>
            </>
          )}
        </section>

        <button onClick={handOver} disabled={!isStaff || (useLive && !ack)}
          className="min-h-16 w-full rounded-3xl bg-primary text-2xl font-semibold text-primary-foreground disabled:opacity-50">
          📲 מסירת המכשיר ל{s.patients.find((x) => x.id === pid)?.alias ?? "מטופל"}
        </button>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Patient bedside app
// ---------------------------------------------------------------------------

type Tab = "day" | "feel" | "progress" | "help";
type Notice = { text: string; kind: "ok" | "warn" | "info" } | null;

function BedsideApp({ patient: p, liveAvatar }: { patient: PatientProfile; liveAvatar: boolean }) {
  const s = useDemo();
  const fs = useFullscreen<HTMLDivElement>();
  const [tab, setTab] = useState<Tab>("day");
  const [notice, setNotice] = useState<Notice>(null);
  const [now, setNow] = useState(() => new Date());
  const record = useServerFn(recordCloudAlert);
  const simli = useQuery({ queryKey: ["simli-status"], queryFn: () => getSimliStatus(), retry: false, enabled: liveAvatar });
  const canLive = liveAvatar && (simli.data ? canStartPaidSession(simli.data, true) : false);

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id); }, []);

  /** Sends an alert to the team. The patient is told honestly whether it reached the cloud. */
  const raise = async (alert: DemoAlert, reply: string) => {
    pushAlert(alert);
    setNotice({ text: `${reply} (שולח לצוות…)`, kind: "info" });
    try {
      await record({ data: alert });
      setNotice({ text: `${reply} ✓ הצוות קיבל את ההודעה.`, kind: "ok" });
    } catch {
      setNotice({ text: `${reply} ⚠️ ההודעה לא הגיעה למחשב הצוות. בבקשה לחצו גם על לחצן הקריאה שליד המיטה.`, kind: "warn" });
    }
  };

  const appendChat = (userText: string, r: Pick<ServerChatResult, "reply" | "quickReplies" | "source" | "rationale">) => {
    const at = new Date().toISOString();
    const pm: ChatMessage = { id: uid(), from: "patient", text: userText, at };
    const bm: ChatMessage = { id: uid(), from: "bot", text: r.reply, at, quickReplies: r.quickReplies, safety: r.source === "safety", rationale: r.rationale };
    setState((st) => {
      const mem = getMemory(st, p.id);
      return { ...st, memory: { ...st.memory, [p.id]: { ...mem, messages: [...mem.messages, pm, bm] } } };
    });
  };

  const onExchange = (userText: string, r: ServerChatResult) => {
    appendChat(userText, r);
    if (r.alert) void raise(r.alert, "אורי שלח הודעה דחופה לצוות.");
  };

  const exit = () => setState((st) => ({ ...st, kiosk: null }));

  return (
    <div ref={fs.ref} dir="rtl" className={cn("min-h-screen bg-calm pb-28", fs.isFullscreen && "overflow-y-auto")}>
      <header className="flex flex-wrap items-center justify-between gap-3 bg-card/90 px-4 py-3 shadow-soft">
        <div>
          <p className="text-3xl font-semibold text-primary">{greetingByHour(now)}, {p.alias}</p>
          <p className="text-lg text-muted-foreground">
            {now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })} · {now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })} · יום {stayDay(p, now)} במחלקה
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void fs.toggle()} className="min-h-12 rounded-2xl border px-4 text-lg">{fs.isFullscreen ? "✕ מסך רגיל" : "⛶ מסך מלא"}</button>
          <StaffExit onExit={exit} />
        </div>
      </header>
      <div className="bg-warning-soft px-4 py-1 text-center text-sm">סימולציה – נתוני דמו בלבד</div>

      {notice && (
        <div role="status" aria-live="assertive"
          className={cn("mx-auto mt-3 flex max-w-6xl items-start justify-between gap-3 rounded-2xl p-4 text-xl",
            notice.kind === "ok" ? "bg-success-soft" : notice.kind === "warn" ? "border-4 border-destructive bg-destructive-soft" : "bg-primary-soft")}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="סגירה" className="min-h-12 min-w-12 rounded-xl bg-card text-xl">✕</button>
        </div>
      )}

      <div className="mx-auto grid max-w-6xl gap-4 p-3 md:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section aria-label="שיחה עם אורי" className="flex flex-col gap-3">
          {canLive ? (
            <SimliAvatar patientId={p.id} canStart variant="patient" preAcknowledged onExchange={onExchange}
              greeting={`${greetingByHour(now)} ${p.alias}, אני אורי. איך אתה מרגיש עכשיו?`} />
          ) : (
            <StillOriChat patient={p} onExchange={onExchange} onLocalAlert={(a) => void raise(a, "אורי שלח הודעה דחופה לצוות.")} rate={s.settings.rate} />
          )}
        </section>

        <section aria-label="האפליקציה שלי" className="flex flex-col gap-3">
          <nav role="tablist" aria-label="מסכים" className="grid grid-cols-4 gap-2">
            {([["day", "📅", "היום שלי"], ["feel", "🙂", "איך אני מרגיש"], ["progress", "⭐", "ההתקדמות"], ["help", "🔔", "עזרה"]] as const).map(([id, icon, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={cn("flex min-h-20 flex-col items-center justify-center rounded-2xl text-lg font-semibold",
                  tab === id ? "bg-primary text-primary-foreground" : id === "help" ? "bg-destructive-soft text-destructive" : "bg-card shadow-soft")}>
                <span className="text-3xl" aria-hidden>{icon}</span>{label}
              </button>
            ))}
          </nav>
          <div className="rounded-3xl bg-card p-5 shadow-soft">
            {tab === "day" && <MyDay patient={p} now={now} />}
            {tab === "feel" && <CheckInPanel patient={p} onAlert={raise} onReply={(t) => setNotice({ text: t, kind: "info" })} />}
            {tab === "progress" && <MyProgress patient={p} now={now} />}
            {tab === "help" && <HelpPanel patient={p} onAlert={raise} />}
          </div>
        </section>
      </div>

      {/* Always-visible call bar; the page has bottom padding so it never covers content. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 px-3 py-2 backdrop-blur">
        <button onClick={() => { const r = helpRequest(p, "nurse"); void raise(r.alert, r.reply); }}
          className="mx-auto block min-h-16 w-full max-w-md rounded-full bg-destructive text-2xl font-bold text-primary-foreground shadow-lift">
          🔔 קריאה לאחות
        </button>
      </div>
    </div>
  );
}

/** Exit needs a deliberate 2-second press, so patients don't leave the kiosk by accident. */
function StaffExit({ onExit }: { onExit: () => void }) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const down = () => { setHolding(true); t.current = setTimeout(() => { setHolding(false); if (window.confirm("לצאת ממסך המטופל? (לצוות בלבד)")) onExit(); }, 2000); };
  const up = () => { setHolding(false); if (t.current) clearTimeout(t.current); };
  return (
    <button onPointerDown={down} onPointerUp={up} onPointerLeave={up} onContextMenu={(e) => e.preventDefault()}
      className={cn("min-h-12 rounded-2xl px-3 text-sm text-muted-foreground", holding && "bg-muted")} aria-label="יציאת צוות – לחיצה ארוכה">
      {holding ? "ממשיכים להחזיק…" : "🔒 צוות"}
    </button>
  );
}

// ---------- Still-photo Ori with text/voice chat (no paid video) ----------

function StillOriChat({ patient: p, onExchange, onLocalAlert, rate }: {
  patient: PatientProfile; rate: number;
  onExchange: (t: string, r: ServerChatResult) => void; onLocalAlert: (a: DemoAlert) => void;
}) {
  const s = useDemo();
  const mem = getMemory(s, p.id);
  const [text, setText] = useState("");
  const [talking, setTalking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listen, setListen] = useState<ListenStatus>("idle");
  const last = [...mem.messages].reverse().find((m) => m.from === "bot");
  const botText = last?.text ?? greeting(p);

  useEffect(() => () => stopSpeech(), []);

  const send = async (raw: string) => {
    const t = raw.trim();
    if (!t || busy) return;
    setText(""); setBusy(true);
    try {
      // Quiz flows stay on the deterministic local engine; everything else tries the server (safety runs there first).
      if (!mem.quiz && t !== QUIZ_TRIGGER) {
        try {
          const history = mem.messages.slice(-8).map((m) => ({ role: m.from === "patient" ? "user" as const : "assistant" as const, content: m.text.slice(0, 500) }));
          const r = await serverChat(p.id, t, history);
          onExchange(t, r);
          speak(r.reply, rate, () => setTalking(true), () => setTalking(false));
          return;
        } catch { /* fall back to local rules */ }
      }
      const r = respond(p, mem as PatientMemory, t);
      setState((st) => ({ ...st, memory: { ...st.memory, [p.id]: r.memory } }));
      if (r.alert) onLocalAlert(r.alert);
      speak(r.reply.text, rate, () => setTalking(true), () => setTalking(false));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={cn("relative overflow-hidden rounded-3xl shadow-lift", talking && "anim-breathe")} style={{ aspectRatio: "4 / 3" }}>
        <img src={ORI_PHOTO} alt="אורי, המלווה שלך" className="h-full w-full object-cover" style={{ objectPosition: "50% 15%" }} />
        {talking && <span className="absolute top-2 right-2 rounded-xl bg-card/90 px-3 py-1 text-lg">🔊 אורי מדבר</span>}
      </div>
      <div aria-live="polite" className={cn("rounded-3xl bg-card p-5 patient-text shadow-soft", last?.safety && "border-4 border-destructive bg-destructive-soft")}>
        {busy ? "אורי חושב…" : botText}
      </div>
      <div className="flex flex-wrap gap-2">
        {(last?.quickReplies ?? ["טוב", "קשה לי", "איך אני מתקדם?"]).map((q) => (
          <button key={q} onClick={() => void send(q)} className="min-h-14 rounded-2xl bg-primary-soft px-5 text-xl text-primary">{q}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => listenOnce((t) => void send(t), setListen)}
          className={cn("min-h-16 flex-1 rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground", listen === "listening" && "anim-ring")}>
          🎤 {listen === "listening" ? "מקשיב…" : "לדבר עם אורי"}
        </button>
        <button onClick={() => speak(botText, rate, () => setTalking(true), () => setTalking(false))} className="min-h-16 rounded-2xl border px-4 text-xl">🔁 שוב</button>
        <button onClick={() => { stopSpeech(); setTalking(false); }} className="min-h-16 rounded-2xl border px-4 text-xl">⏹</button>
      </div>
      {(listen === "unsupported" || listen === "denied" || listen === "error") && <p className="text-lg">אי אפשר להשתמש במיקרופון כרגע – אפשר לכתוב.</p>}
      <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="כתבו לאורי" placeholder="או כתבו כאן…" className="min-h-14 flex-1 rounded-2xl border bg-card px-4 text-xl" />
        <button disabled={busy} className="min-h-14 rounded-2xl bg-primary px-6 text-xl text-primary-foreground disabled:opacity-50">שלח</button>
      </form>
    </>
  );
}

// ---------- Tabs ----------

function MyDay({ patient: p, now }: { patient: PatientProfile; now: Date }) {
  const schedule = useMemo(() => dailySchedule(p), [p]);
  const cur = currentIndex(schedule, now);
  return (
    <div>
      <h2 className="mb-3 text-2xl text-primary">סדר היום שלי</h2>
      <ol className="space-y-2">
        {schedule.map((it, i) => (
          <li key={it.time + it.title} aria-current={i === cur ? "step" : undefined}
            className={cn("flex items-start gap-3 rounded-2xl p-3 text-xl", i === cur ? "border-4 border-primary bg-primary-soft" : i < cur || cur === -1 ? "opacity-60" : "border")}>
            <span className="w-16 shrink-0 font-semibold tabular-nums">{it.time}</span>
            <span className="text-2xl" aria-hidden>{it.icon}</span>
            <span>
              <span className="font-semibold">{it.title}</span>
              {i === cur && <span className="ms-2 rounded-lg bg-primary px-2 text-base text-primary-foreground">עכשיו / הבא</span>}
              {it.detail && <span className="block text-lg text-muted-foreground">{it.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-base text-muted-foreground">השעות משוערות. הצוות יעדכן אם משהו משתנה.</p>
    </div>
  );
}

function CheckInPanel({ patient: p, onAlert, onReply }: {
  patient: PatientProfile; onAlert: (a: DemoAlert, reply: string) => Promise<void>; onReply: (t: string) => void;
}) {
  const s = useDemo();
  const [mood, setMood] = useState<Mood | null>(null);
  const [pain, setPain] = useState<PainLevel | null>(null);
  const [sleep, setSleep] = useState<Sleep | null>(null);
  const today = new Date().toDateString();
  const done = s.checkIns.find((c) => c.patientId === p.id && new Date(c.at).toDateString() === today);

  const submit = () => {
    if (!mood || !pain || !sleep) return;
    const c: CheckIn = { id: uid(), patientId: p.id, at: new Date().toISOString(), mood, pain, sleep };
    setState((st) => ({ ...st, checkIns: [c, ...st.checkIns].slice(0, 200) }));
    const r = evaluateCheckIn(p, c);
    if (r.alert) void onAlert(r.alert, r.reply); else onReply(r.reply);
  };

  const pick = "min-h-16 rounded-2xl px-4 text-xl";
  return (
    <div className="space-y-5">
      <h2 className="text-2xl text-primary">איך אני מרגיש היום</h2>
      {done && <p className="rounded-2xl bg-success-soft p-3 text-lg">כבר מילאתם היום ({new Date(done.at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}). אפשר לעדכן שוב בכל רגע.</p>}
      <fieldset>
        <legend className="mb-2 text-xl font-semibold">מצב הרוח</legend>
        <div className="grid grid-cols-5 gap-2">
          {moodFaces.map((m) => (
            <button key={m.value} type="button" aria-pressed={mood === m.value} onClick={() => setMood(m.value)}
              className={cn("flex min-h-20 flex-col items-center justify-center rounded-2xl text-base", mood === m.value ? "bg-primary text-primary-foreground" : "border")}>
              <span className="text-4xl" aria-hidden>{m.face}</span>{m.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-xl font-semibold">כאב</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {painOptions.map((o) => (
            <button key={o.value} type="button" aria-pressed={pain === o.value} onClick={() => setPain(o.value)}
              className={cn(pick, pain === o.value ? "bg-primary text-primary-foreground" : "border")}>{o.label}</button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-xl font-semibold">שינה בלילה</legend>
        <div className="grid grid-cols-3 gap-2">
          {sleepOptions.map((o) => (
            <button key={o.value} type="button" aria-pressed={sleep === o.value} onClick={() => setSleep(o.value)}
              className={cn(pick, sleep === o.value ? "bg-primary text-primary-foreground" : "border")}><span aria-hidden>{o.icon}</span> {o.label}</button>
          ))}
        </div>
      </fieldset>
      <button onClick={submit} disabled={!mood || !pain || !sleep}
        className="min-h-16 w-full rounded-3xl bg-primary text-2xl font-semibold text-primary-foreground disabled:opacity-50">שליחה</button>
    </div>
  );
}

function MyProgress({ patient: p, now }: { patient: PatientProfile; now: Date }) {
  const s = useDemo();
  const summary = progressSummary(p);
  const today = now.toDateString();
  const todays = s.outcomes.filter((o) => o.patientId === p.id && new Date(o.at).toDateString() === today);
  const max = Math.max(...p.weekly.map((w) => w.steps), 1);
  const phaseLabel = { admission: "קבלה", week1: "שבוע 1", week2: "שבוע 2", discharge: "שחרור" } as const;
  return (
    <div className="space-y-5">
      <h2 className="text-2xl text-primary">ההתקדמות שלי</h2>
      <p className="rounded-2xl bg-success-soft p-4 text-xl">{summary.trend === "up" ? "📈 " : "🌱 "}{summary.text}</p>
      {p.goal && (
        <div className="rounded-2xl border-2 border-primary p-4">
          <p className="text-lg text-muted-foreground">המטרה שלי (נקבעה עם {p.goal.approvedBy})</p>
          <p className="text-2xl font-semibold">🎯 {p.goal.text}</p>
        </div>
      )}
      <div>
        <h3 className="mb-2 text-xl font-semibold">הישגים שהצוות אישר</h3>
        {p.achievements.length === 0 ? <p className="text-lg">ההישגים יופיעו כאן אחרי שהצוות יאשר אותם.</p> : (
          <ul className="space-y-2">{p.achievements.map((a) => <li key={a.id} className="rounded-2xl bg-primary-soft p-3 text-xl">⭐ {a.text}</li>)}</ul>
        )}
      </div>
      {p.weekly.length > 1 && (
        <div>
          <h3 className="mb-2 text-xl font-semibold">צעדים בתרגול (בהשגחה)</h3>
          <div className="flex h-40 items-end gap-3" role="img" aria-label={p.weekly.map((w) => `${phaseLabel[w.phase]}: ${w.steps} צעדים`).join(", ")}>
            {p.weekly.map((w) => (
              <div key={w.phase} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-lg font-semibold">{w.steps}</span>
                <div className="w-full rounded-t-xl bg-primary" style={{ height: `${Math.max(6, (w.steps / max) * 70)}%` }} />
                <span className="text-base">{phaseLabel[w.phase]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <h3 className="mb-2 text-xl font-semibold">התרגול של היום</h3>
        {todays.length === 0 ? <p className="text-lg">עוד לא נרשם תרגול היום. הפיזיותרפיסט/ית ירשמו אחרי התרגול.</p> : (
          <ul className="space-y-2">{todays.map((o) => <li key={o.id} className="rounded-2xl border p-3 text-xl">✅ {o.station}</li>)}</ul>
        )}
      </div>
    </div>
  );
}

function HelpPanel({ patient: p, onAlert }: { patient: PatientProfile; onAlert: (a: DemoAlert, reply: string) => Promise<void> }) {
  const [sent, setSent] = useState<HelpKind | null>(null);
  return (
    <div className="space-y-4">
      <h2 className="text-2xl text-primary">במה אפשר לעזור?</h2>
      <p className="rounded-2xl bg-warning-soft p-3 text-lg">במקרה חירום – לחצו על לחצן הקריאה שליד המיטה. המסך הזה לא מחליף אותו.</p>
      <div className="grid grid-cols-2 gap-3">
        {helpOptions.map((h) => (
          <button key={h.kind} onClick={() => { const r = helpRequest(p, h.kind); setSent(h.kind); void onAlert(r.alert, r.reply); }}
            className={cn("flex min-h-24 flex-col items-center justify-center gap-1 rounded-3xl text-xl font-semibold",
              h.kind === "nurse" ? "bg-destructive text-primary-foreground" : "border-2 bg-card", sent === h.kind && "ring-4 ring-primary")}>
            <span className="text-4xl" aria-hidden>{h.icon}</span>{h.label}
          </button>
        ))}
      </div>
    </div>
  );
}

