import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createSimliSession, synthesizeSimliSpeech } from "@/lib/simli.functions";
import { SIMLI_MAX_IDLE_SECONDS, SIMLI_MAX_SESSION_SECONDS, billableMinutes, chunkPcm, classifySimliError } from "@/lib/simliCore";
import { serverChat } from "@/lib/serverChat";
import { boundHistory, createVoiceTurn, splitSentences, type ChatTurn, type VoicePhase } from "@/lib/voiceTurn";
import { stopSpeech } from "@/lib/speech";
import { ORI_PHOTO } from "@/lib/avatarAdapter";
import { useFullscreen } from "@/lib/useFullscreen";
import { cn } from "@/lib/utils";
import { useFaceSignals, faceStatusLabel } from "@/lib/useFaceSignals";
import { ACKS, quickAck, shouldAck } from "@/lib/quickAck";

type Phase = "idle" | "token" | "connecting" | "live" | "ended" | "error";
interface CostLog { at: string; seconds: number; minutes: number }
interface Timing { asr?: number | undefined; ai?: number; tts1?: number; audio1?: number; total?: number }
type SimliLike = { stop: () => Promise<void>; sendAudioData: (d: Uint8Array) => void; ClearBuffer?: () => void };
const COST_KEY = "simli-test-cost-log";
const GREETING = "שלום, אני אורי. איך אתה מרגיש היום?";

const voiceLabel: Record<VoicePhase, string> = {
  off: "מצב שיחה קולית כבוי",
  listening: "🎤 מקשיב לכם…",
  thinking: "⏳ אורי חושב…",
  speaking: "🔊 אורי מדבר — המיקרופון סגור (ממתין לסיום הדיבור)",
  "waiting-end": "🔊 ממתין לסיום הדיבור…",
  unsupported: "הדפדפן לא תומך בזיהוי דיבור — אפשר להקליד",
  denied: "אין הרשאת מיקרופון — אפשר להקליד",
};

function getRecognizerCtor() {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] || w["webkitSpeechRecognition"]) as (new () => never) | undefined ?? null;
}

export function SimliAvatar({ patientId, canStart }: { patientId: string; canStart: boolean }) {
  const mint = useServerFn(createSimliSession);
  const tts = useServerFn(synthesizeSimliSpeech);
  const [faceOn, setFaceOn] = useState(false);
  const face = useFaceSignals(faceOn);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clientRef = useRef<SimliLike | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<ChatTurn[]>([]);
  const turnRef = useRef(0); // invalidates in-flight turns after stop
  const allSentRef = useRef(true);
  const voiceRef = useRef<ReturnType<typeof createVoiceTurn> | null>(null);
  const ackCache = useRef(new Map<string, { pcm: Uint8Array; seconds: number }>());
  const fs = useFullscreen<HTMLDivElement>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [ack, setAck] = useState(false);
  const [videoOk, setVideoOk] = useState(false);
  const [audioOk, setAudioOk] = useState(false);
  const [err, setErr] = useState<{ title: string; detail: string } | null>(null);
  const [isDemoFace, setIsDemoFace] = useState(false);
  const [transcript, setTranscript] = useState<ChatTurn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState<VoicePhase>("off");
  const [timing, setTiming] = useState<Timing | null>(null);
  const [log, setLog] = useState<CostLog[]>([]);
  const [asrSupported, setAsrSupported] = useState(true);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    try { setLog(JSON.parse(localStorage.getItem(COST_KEY) ?? "[]")); } catch { /* ignore */ }
    setAsrSupported(Boolean(getRecognizerCtor()));
  }, []);

  // Visible countdown so the 60-second cap never feels like a sudden failure.
  useEffect(() => {
    if (phase !== "live" && phase !== "connecting") return;
    const id = setInterval(() => {
      if (!startedAt.current) return;
      setLeft(Math.max(0, SIMLI_MAX_SESSION_SECONDS - Math.round((Date.now() - startedAt.current) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const listenStartRef = useRef(0);
  const getVoice = () => {
    if (!voiceRef.current) {
      const Ctor = getRecognizerCtor();
      voiceRef.current = createVoiceTurn({
        createRecognizer: Ctor ? () => new Ctor() : null,
        onUtterance: (t) => void runTurn(t, "voice"),
        onPhase: (p) => { setVoice(p); if (p === "listening") listenStartRef.current = performance.now(); },
      });
    }
    return voiceRef.current;
  };

  const stop = async (next: Phase = "ended") => {
    turnRef.current++;
    voiceRef.current?.destroy(); voiceRef.current = null; setVoice("off");
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const c = clientRef.current;
    clientRef.current = null;
    if (c) {
      try { c.ClearBuffer?.(); } catch { /* ignore */ }
      try { await c.stop(); } catch { /* ignore */ }
      const seconds = Math.round((Date.now() - startedAt.current) / 1000);
      const entry = { at: new Date().toISOString(), seconds, minutes: billableMinutes(seconds) };
      setLog((l) => {
        const nl = [entry, ...l].slice(0, 20);
        localStorage.setItem(COST_KEY, JSON.stringify(nl));
        return nl;
      });
    }
    setVideoOk(false); setAudioOk(false); setBusy(false);
    setPhase((p) => (p === "error" ? p : next));
  };

  useEffect(() => () => { void stop(); }, []); // cleanup on unmount

  const start = async () => {
    if (phase === "token" || phase === "connecting" || phase === "live") return; // single-flight
    setErr(null); setPhase("token"); historyRef.current = []; setTranscript([]);
    stopSpeech(); // never run browser speechSynthesis alongside Simli audio
    // Ask for mic permission while we still have the user's tap, then release it immediately.
    if (getRecognizerCtor() && navigator.mediaDevices?.getUserMedia) {
      try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); } catch { /* handled by recognizer */ }
    }
    try {
      const r = await mint({ data: { acknowledgeBilling: ack } });
      if (!r.ok) throw new Error(r.error);
      setIsDemoFace(r.isDemoFace);
      setPhase("connecting");
      // Prepare Ori's opening line in parallel with the video connection.
      const greetP = tts({ data: { text: GREETING } }).catch(() => null);
      const { SimliClient, LogLevel } = await import("simli-client");
      // Fresh client per session, created right before start; never reused.
      const client = new SimliClient(r.sessionToken, videoRef.current!, audioRef.current!, null, LogLevel.INFO);
      client.on("error", (d) => { setErr(classifySimliError(`webrtc ${d}`)); setPhase("error"); void stop("error"); });
      client.on("startup_error", (d) => { setErr(classifySimliError(`session ${d}`)); setPhase("error"); void stop("error"); });
      client.on("stop", () => { void stop(); });
      // Simli's own playback signal: reopen the mic only after all audio was sent and Ori went silent.
      client.on("silent", () => { if (allSentRef.current) voiceRef.current?.botMaybeFinished(); });
      clientRef.current = client;
      startedAt.current = Date.now();
      setLeft(SIMLI_MAX_SESSION_SECONDS);
      timer.current = setTimeout(() => { void stop(); }, SIMLI_MAX_SESSION_SECONDS * 1000);
      await client.start();
      setPhase("live");
      // Ori opens the conversation, then the mic opens automatically (no extra taps).
      const g = await greetP;
      const v = getRecognizerCtor() ? getVoice() : null;
      if (g?.ok && clientRef.current === client) {
        allSentRef.current = false;
        v?.botSpeaking(g.seconds);
        for (const c of chunkPcm(pcmFrom(g.pcmBase64))) client.sendAudioData(c);
        historyRef.current = [{ role: "assistant", content: GREETING }];
        setTranscript([{ role: "assistant", content: GREETING }]);
        allSentRef.current = true;
        v?.enable();
        v?.botMaybeFinished();
      } else {
        v?.enable();
      }
      // Pre-render the short acknowledgment clips once per session so they play with zero delay.
      for (const t of Object.values(ACKS).flat()) {
        if (ackCache.current.has(t)) continue;
        void tts({ data: { text: t } }).then((a) => { if (a.ok) ackCache.current.set(t, { pcm: pcmFrom(a.pcmBase64), seconds: a.seconds }); }).catch(() => {});
      }
    } catch (e) {
      setErr(classifySimliError(e));
      setPhase("error");
      await stop("error");
    }
  };

  const pcmFrom = (b64: string) => {
    const bin = atob(b64);
    const pcm = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
    return pcm;
  };

  const runTurn = async (raw: string, via: "voice" | "text") => {
    const q = raw.trim();
    if (!q || !clientRef.current) { voiceRef.current?.turnDone(); return; }
    const my = ++turnRef.current;
    const t0 = performance.now();
    const asr = via === "voice" ? Math.round(t0 - listenStartRef.current) : undefined;
    setBusy(true); setText(""); setTiming({ asr });
    setTranscript((t) => [...t, { role: "user", content: q }]);
    let produced = false;
    const v = face.get();
    const ack = !shouldAck(q) ? undefined : ackCache.current.get(quickAck(q, v, historyRef.current.length).text);
    const chatP = serverChat(patientId, q, boundHistory(historyRef.current), v); // safety + protocols server-side
    if (ack && clientRef.current) {
      // Instant pre-rendered micro-response (reflection/validation) while the AI reply is prepared.
      allSentRef.current = false;
      voiceRef.current?.botSpeaking(ack.seconds);
      for (const c of chunkPcm(ack.pcm)) clientRef.current.sendAudioData(c);
      produced = true;
    }
    try {
      const r = await chatP;
      if (my !== turnRef.current) return;
      // Safety replies cut any still-playing acknowledgement.
      if (r.source === "safety") clientRef.current?.ClearBuffer?.();
      const tAi = performance.now();
      setTiming((x) => ({ ...x, ai: Math.round(tAi - t0) }));
      historyRef.current = boundHistory([...historyRef.current, { role: "user", content: q }, { role: "assistant", content: r.reply }]);
      setTranscript((t) => [...t, { role: "assistant", content: r.reply }]);

      // TTS: first sentence immediately; the rest start in parallel and play in order.
      const parts = splitSentences(r.reply);
      allSentRef.current = false;
      const jobs = parts.map((p) => tts({ data: { text: p } }));
      for (let i = 0; i < jobs.length; i++) {
        const a = await jobs[i]!;
        if (my !== turnRef.current || !clientRef.current) return;
        if (!a.ok) { setErr(classifySimliError("tts")); break; }
        if (i === 0) setTiming((x) => ({ ...x, tts1: Math.round(performance.now() - tAi) }));
        voiceRef.current?.botSpeaking(a.seconds);
        for (const c of chunkPcm(pcmFrom(a.pcmBase64))) clientRef.current.sendAudioData(c);
        produced = true;
        if (i === 0) setTiming((x) => ({ ...x, audio1: Math.round(performance.now() - t0) }));
      }
      setTiming((x) => ({ ...x, total: Math.round(performance.now() - t0) }));
    } catch (e) {
      setErr(classifySimliError(e));
    } finally {
      allSentRef.current = true;
      if (my === turnRef.current) {
        setBusy(false);
        // Fallback when Simli's "silent" never fires: controller waits for estimated playback end.
        if (produced) voiceRef.current?.botMaybeFinished(); else voiceRef.current?.turnDone();
      }
    }
  };

  const toggleVoice = () => {
    const v = getVoice();
    if (v.enabled) v.disable(); else v.enable();
  };

  const sendTyped = () => {
    const t = text.trim();
    if (!t || busy) return;
    if (voiceRef.current?.enabled) voiceRef.current.submitTyped(t); else void runTurn(t, "text");
  };

  const active = phase === "connecting" || phase === "live";
  const verified = phase === "live" && videoOk && audioOk;

  return (
    <div ref={fs.ref} className={cn("flex flex-col gap-3 text-lg", fs.isFullscreen && "h-full w-full overflow-y-auto bg-calm p-3")}>
      <div
        className={cn("relative overflow-hidden bg-muted shadow-lift", fs.isFullscreen ? "min-h-0 flex-1 rounded-none" : "rounded-3xl")}
        style={fs.isFullscreen ? { maxHeight: "50vh" } : { aspectRatio: "1 / 1", maxWidth: 480 }}
      >
        <video ref={videoRef} autoPlay playsInline onPlaying={() => setVideoOk(true)}
          className={cn("h-full w-full", fs.isFullscreen ? "object-contain" : "object-cover", videoOk ? "" : "invisible")} />
        <audio ref={audioRef} autoPlay onPlaying={() => setAudioOk(true)} />
        {!videoOk && (
          <img src={ORI_PHOTO} alt="אורי עם כובע ביחד – תמונה מקורית" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 15%" }} />
        )}
        {phase === "live" && (
          <span aria-live="polite" className="absolute top-2 right-2 rounded-xl bg-card/90 px-3 py-1 text-base shadow-soft">{voiceLabel[voice]}</span>
        )}
        <div className="absolute bottom-2 left-2 flex flex-col items-start gap-1">
          <button onClick={() => void fs.toggle()} aria-label="מסך מלא" className="min-h-12 rounded-2xl bg-card/90 px-4 text-lg shadow-soft backdrop-blur">
            {fs.isFullscreen ? "✕ צא ממסך מלא" : "⛶ מסך מלא"}
          </button>
          {fs.unsupported && <span className="rounded-xl bg-card/90 px-2 py-1 text-xs">הדפדפן לא תומך במסך מלא – אפשר להישאר בתצוגה הרגילה</span>}
        </div>
      </div>

      <p role="status" className="text-base">
        {phase === "idle" && "לא פעיל. אין חיוב עד שלוחצים 'התחל'."}
        {phase === "token" && "שלב 1: מבקש אסימון סשן מהשרת…"}
        {phase === "connecting" && "שלב 2: פותח חיבור וידאו (WebRTC)…"}
        {phase === "live" && (verified ? "✅ וידאו ושמע התקבלו בפועל" : videoOk ? "וידאו התקבל — שמע טרם אומת (אמרו משפט)" : "מחובר — ממתין לפריים וידאו ראשון")}
        {phase === "live" && ` · נותרו ${left} שנ׳`}
        {phase === "ended" && `הסשן הסתיים (מגבלת בדיקה: עד ${SIMLI_MAX_SESSION_SECONDS} שניות, או ${SIMLI_MAX_IDLE_SECONDS} שניות בלי דיבור). אפשר להתחיל שוב.`}
        {phase === "error" && "הסשן נעצר בגלל שגיאה."}
      </p>
      {isDemoFace && active && <p className="rounded-xl bg-warning-soft p-2 text-sm">פנים לדוגמה מ־Simli — אינן תמונת אורי.</p>}
      {err && (
        <div className="rounded-xl border-2 border-destructive bg-destructive-soft p-3">
          <p className="font-bold">{err.title}</p>
          <p className="text-sm">{err.detail}</p>
        </div>
      )}

      {!active ? (
        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 h-5 w-5" />
            אני מבין/ה שזה סשן בתשלום ב־Simli (עד {SIMLI_MAX_SESSION_SECONDS} שניות, נעצר אוטומטית), עם נתוני דמו בלבד.
          </label>
          <button onClick={start} disabled={!canStart || !ack || phase === "token"}
            className="min-h-12 rounded-2xl bg-primary px-5 text-lg text-primary-foreground disabled:opacity-50">
            ▶ התחל סשן בדיקה ({SIMLI_MAX_SESSION_SECONDS} שנ׳)
          </button>
          {!canStart && <p className="text-sm text-muted-foreground">הכפתור נעול עד שהמפתח יוחלף ויאושר.</p>}
        </div>
      ) : (
        <button onClick={() => void stop()} className="min-h-14 rounded-2xl border-2 border-destructive px-5 text-xl font-bold">
          ⏹ עצור הכל (קול, שמע וסשן)
        </button>
      )}

      {phase === "live" && (
        <div className="flex flex-col gap-2">
          {asrSupported ? (
            <button onClick={toggleVoice} aria-pressed={voice !== "off"}
              className={cn("min-h-14 rounded-2xl px-4 text-xl", voice !== "off" ? "bg-primary text-primary-foreground" : "border-2 border-primary")}>
              {voice !== "off" ? "🎤 מצב שיחה קולית פעיל — לחצו לכיבוי" : "🎤 מצב שיחה קולית"}
            </button>
          ) : (
            <p className="rounded-xl bg-warning-soft p-2 text-sm">הדפדפן לא תומך בזיהוי דיבור. אפשר להקליד. (תכנון עתידי: זיהוי דיבור בשרת לצוות בלבד.)</p>
          )}
          <label className="flex items-center gap-2 text-base"><input type="checkbox" checked={faceOn} onChange={(e) => setFaceOn(e.target.checked)} className="h-5 w-5" />התאם את אורי להבעת הפנים (מצלמה, ניתוח במכשיר בלבד) — <span aria-live="polite">{faceStatusLabel[face.status]}</span></label>
          <p className="text-sm text-muted-foreground">שיחה בתורות: המיקרופון נסגר בזמן שאורי מדבר ונפתח מחדש בסיומו. אי אפשר לקטוע את אורי באמצע (barge-in לא זמין).</p>

          <ul aria-label="תמליל השיחה" className="max-h-64 space-y-2 overflow-y-auto rounded-2xl bg-card p-3">
            {transcript.length === 0 && <li className="text-muted-foreground">התמליל יופיע כאן.</li>}
            {transcript.map((m, i) => (
              <li key={i} className={cn("rounded-xl p-2", m.role === "user" ? "bg-muted" : "bg-primary/10")}>
                <span className="font-bold">{m.role === "user" ? "אתם: " : "אורי: "}</span>{m.content}
              </li>
            ))}
          </ul>

          <form onSubmit={(e) => { e.preventDefault(); sendTyped(); }}
            className={cn("flex gap-2", fs.isFullscreen && "sticky bottom-0 z-10 bg-calm py-2")}>
            <input value={text} onChange={(e) => setText(e.target.value)} aria-label="כתבו לאורי" placeholder="או כתבו משפט…" className="min-h-12 flex-1 rounded-2xl border bg-card px-3 text-lg" />
            <button disabled={busy} className="min-h-12 rounded-2xl bg-primary px-4 text-primary-foreground disabled:opacity-50">שלח</button>
          </form>

          {timing && (
            <p className="text-sm text-muted-foreground" aria-label="זמני שלבים (צוות)">
              זמנים: זיהוי דיבור {timing.asr ?? "—"} מ״ש · AI {timing.ai ?? "…"} מ״ש · קול ראשון {timing.tts1 ?? "…"} מ״ש · עד שמע ראשון ל־Simli {timing.audio1 ?? "…"} מ״ש · סה״כ {timing.total ?? "…"} מ״ש
            </p>
          )}
        </div>
      )}

      {log.length > 0 && (
        <details className="text-sm">
          <summary>יומן עלויות בדיקה (במכשיר זה)</summary>
          <ul>{log.map((l) => <li key={l.at}>{new Date(l.at).toLocaleString("he-IL")} — {l.seconds} שנ׳ (~{l.minutes} דק׳ לחיוב)</li>)}</ul>
        </details>
      )}
    </div>
  );
}
