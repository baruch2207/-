import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { respond, greeting } from "@/lib/engine";
import { QUIZ_TRIGGER } from "@/lib/questionnaire";
import { serverChat } from "@/lib/serverChat";
import { quickAck, shouldAck } from "@/lib/quickAck";
import { activePatient, getMemory, setState, useDemo } from "@/lib/store";
import { speak, stopSpeech, listenOnce, type ListenStatus } from "@/lib/speech";
import { ORI_PHOTO } from "@/lib/avatarAdapter";
import { useFullscreen } from "@/lib/useFullscreen";
import { cn } from "@/lib/utils";
import { useFaceSignals, faceStatusLabel } from "@/lib/useFaceSignals";
import type { ChatMessage, PatientMemory } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "אורי | ביחד – שיחה למטופל" },
      { name: "description", content: "מלווה שיחתי לשיקום גריאטרי – הדגמה עם נתונים מדומים בלבד." },
      { property: "og:title", content: "אורי | ביחד" },
      { property: "og:description", content: "מלווה שיחתי לשיקום – סימולציה בלבד." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PatientScreen,
});

function PatientScreen() {
  const s = useDemo();
  const [text, setText] = useState("");
  const [talking, setTalking] = useState(false);
  const [listen, setListen] = useState<ListenStatus>("idle");
  const [faceOn, setFaceOn] = useState(false);
  const face = useFaceSignals(faceOn);
  // Fullscreen covers the whole screen (notice + avatar + chat) so the conversation stays usable there.
  const fs = useFullscreen<HTMLDivElement>();
  // "idle" = not tried yet; "verified" = a real server round-trip succeeded; "failed" = fell back to local
  const [serverState, setServerState] = useState<"idle" | "verified" | "failed">("idle");
  const p = activePatient(s);
  const mem = p ? getMemory(s, p.id) : undefined;
  const last = mem ? [...mem.messages].reverse().find((m) => m.from === "bot") : undefined;
  const botText = last?.text ?? (p ? greeting(p) : "לא נבחר מטופל לדמו");

  const uid = () => Math.random().toString(36).slice(2, 10);

  const send = async (t: string) => {
    const trimmed = t.trim();
    if (!trimmed || !p || !mem) return;
    setText("");

    // Server path: only when enabled, and never for safety-critical quiz flows (those stay local/deterministic).
    const useServer = s.settings.useServer && !mem.quiz && trimmed !== QUIZ_TRIGGER;
    if (useServer) {
      const v = face.get();
      // Instant micro-response (reflection/validation) while the full reply is prepared.
      if (s.settings.autoSpeak && shouldAck(trimmed)) speak(quickAck(trimmed, v, mem.messages.length).text, s.settings.rate, () => setTalking(true), () => {});
      try {
        const r = await serverChat(p.id, trimmed, [], v);
        const at = new Date().toISOString();
        const patientMsg: ChatMessage = { id: uid(), from: "patient", text: trimmed, at };
        const botMsg: ChatMessage = {
          id: uid(), from: "bot", text: r.reply, at,
          quickReplies: r.quickReplies, safety: r.source === "safety", rationale: r.rationale,
        };
        const nextMem: PatientMemory = { ...mem, messages: [...mem.messages, patientMsg, botMsg] };
        setState((st) => ({ ...st, memory: { ...st.memory, [p.id]: nextMem }, alerts: r.alert ? [r.alert, ...st.alerts] : st.alerts }));
        setServerState("verified"); // connection shown as active only after this real round-trip
        if (s.settings.autoSpeak) speak(r.reply, s.settings.rate, () => setTalking(true), () => setTalking(false), r.source !== "safety");
        return;
      } catch {
        stopSpeech();
        setServerState("failed"); // fall through to the local engine
      }
    }

    const r = respond(p, mem, trimmed);
    setState((st) => ({ ...st, memory: { ...st.memory, [p.id]: r.memory }, alerts: r.alert ? [r.alert, ...st.alerts] : st.alerts }));
    if (s.settings.autoSpeak) speak(r.reply.text, s.settings.rate, () => setTalking(true), () => setTalking(false));
  };

  const statusText: Record<ListenStatus, string> = {
    idle: "", listening: "מקשיב…", unsupported: "הדפדפן לא תומך בזיהוי דיבור – אפשר להקליד",
    denied: "אין הרשאת מיקרופון – אפשר להקליד", error: "זיהוי הדיבור נכשל – אפשר להקליד", "no-speech": "לא שמעתי – נסו שוב",
  };

  return (
    <main dir="rtl" className="min-h-screen bg-calm">
      <div
        ref={fs.ref}
        className={cn("flex flex-col", fs.isFullscreen && "h-screen w-screen overflow-y-auto bg-calm")}
      >
        <div className="bg-warning-soft px-4 py-2 text-center text-base">סימולציה – אין שימוש במטופלים אמיתיים</div>
        <div className={cn("mx-auto grid w-full max-w-6xl gap-4 p-3 sm:gap-6 sm:p-4 md:p-8", fs.isFullscreen ? "grid-cols-1" : "lg:grid-cols-2")}>
          <div className="flex flex-col gap-2">
            <div
              className={cn(
                "relative overflow-hidden shadow-lift",
                talking && "anim-breathe",
                fs.isFullscreen ? "bg-black" : "rounded-3xl",
              )}
              style={fs.isFullscreen ? { height: "calc(100dvh - 2.75rem)" } : { aspectRatio: "16 / 9" }}
            >
              <img
                src={ORI_PHOTO}
                alt="אורי, המאמן, עם כובע ביחד – תמונת לוגו מקורית"
                className={cn("h-full w-full", fs.isFullscreen ? "object-contain" : "object-cover")}
                style={fs.isFullscreen ? undefined : { objectPosition: "50% 15%" }}
              />
              <div className="absolute bottom-3 left-3 flex flex-col items-start gap-1">
                <button
                  onClick={() => void fs.toggle()}
                  aria-label="מסך מלא"
                  className="min-h-12 rounded-2xl bg-card/90 px-4 text-lg shadow-soft backdrop-blur"
                >
                  {fs.isFullscreen ? "✕ צא ממסך מלא" : "⛶ מסך מלא"}
                </button>
                {fs.unsupported && (
                  <span className="rounded-xl bg-card/90 px-2 py-1 text-xs">הדפדפן לא תומך במסך מלא – אפשר להישאר בתצוגה הרגילה</span>
                )}
              </div>
            </div>
            <p className="px-1 text-sm text-muted-foreground">
              תמונת אורי המקורית – ללא תנועת שפתיים, ללא עלות. אווטאר וידאו חי עם שיחה קולית (Simli) זמין לבדיקת צוות בלבד – אינו מוכן למטופלים.
            </p>
            <Link to="/simli" className="inline-flex min-h-12 items-center justify-center rounded-2xl border-2 border-primary px-4 text-lg text-primary">
              🎥 בדיקת אווטאר חי + שיחה קולית (צוות בלבד, בתשלום)
            </Link>
          </div>
          <section className="flex flex-col gap-4" aria-label="הדגמת שיחה מקומית">
            <h1 className="text-3xl text-primary">אורי | ביחד</h1>
            <p className="text-muted-foreground">
              {s.settings.useServer
                ? serverState === "verified"
                  ? "מחובר לשרת AI (נבדק בשיחה זו) – נתוני דמו בלבד. נפרד מהאווטאר החי."
                  : serverState === "failed"
                    ? "השרת לא זמין – חזרה למנוע כללים מקומי."
                    : "מצב שרת AI מופעל – החיבור יסומן כפעיל רק לאחר תשובה מוצלחת."
                : "הדגמת מנוע שיחה מקומי (כללים בלבד) – נפרד לחלוטין מהאווטאר החי."}
              {talking ? " אורי מדבר…" : ""}
            </p>
            <div className={cn("rounded-3xl bg-card p-6 patient-text shadow-soft", last?.safety && "border-4 border-destructive bg-destructive-soft")}>{botText}</div>
            <div className="flex flex-wrap gap-3">
              {(last?.quickReplies ?? ["טוב", "קשה לי", "איך אני מתקדם?"]).map((q) => (
                <button key={q} onClick={() => send(q)} className="min-h-14 rounded-2xl bg-primary-soft px-5 text-xl text-primary">{q}</button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send(text); }}
              className={cn("flex gap-2", fs.isFullscreen && "sticky bottom-0 z-10 bg-calm py-2")}>
              <input value={text} onChange={(e) => setText(e.target.value)} aria-label="כתבו לאורי" placeholder="כתבו כאן…" className="min-h-14 flex-1 rounded-2xl border bg-card px-4 text-xl" />
              <button className="min-h-14 rounded-2xl bg-primary px-6 text-xl text-primary-foreground">שלח</button>
            </form>
            <label className="flex items-center gap-2 text-base">
              <input type="checkbox" checked={faceOn} onChange={(e) => setFaceOn(e.target.checked)} className="h-5 w-5" />
              אורי יתאים את עצמו להבעת הפנים (מצלמה, ניתוח במכשיר בלבד{s.settings.useServer ? "" : " — פעיל כשתשובות שרת מופעלות בהגדרות"}) — <span aria-live="polite">{faceStatusLabel[face.status]}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => listenOnce(send, setListen)} className={cn("min-h-14 rounded-2xl border px-5 text-xl", listen === "listening" && "anim-ring")}>🎤 דברו</button>
              <button onClick={() => speak(botText, s.settings.rate, () => setTalking(true), () => setTalking(false))} className="min-h-14 rounded-2xl border px-5 text-xl">השמע שוב</button>
              <button onClick={() => { stopSpeech(); setTalking(false); }} className="min-h-14 rounded-2xl border px-5 text-xl">עצור</button>
            </div>
            {statusText[listen] && <p role="status" className="text-lg">{statusText[listen]}</p>}
          </section>
        </div>
      </div>
    </main>
  );
}
