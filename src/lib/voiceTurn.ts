// Pure, SDK-agnostic voice-turn controller for the Simli voice conversation.
// Half-duplex by design: the microphone is NEVER open while Ori speaks (prevents feedback);
// barge-in is not supported. No audio or transcripts are logged.

export type VoicePhase = "off" | "listening" | "thinking" | "speaking" | "waiting-end" | "unsupported" | "denied";

export interface RecognizerLike {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous?: boolean;
  start(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export interface VoiceDeps {
  createRecognizer: (() => RecognizerLike) | null;
  onUtterance: (text: string) => void;
  onPhase: (p: VoicePhase) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  /** Delay before reopening the mic after Ori truly finished (echo tail). */
  reopenDelayMs?: number;
  /** Same transcript within this window is treated as a duplicate. */
  dedupeWindowMs?: number;
}

export function normalizeUtterance(t: string): string {
  return t.replace(/[.,!?״"'׳\-–]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

export function createVoiceTurn(deps: VoiceDeps) {
  const now = deps.now ?? (() => Date.now());
  const setT = deps.setTimer ?? ((f, ms) => setTimeout(f, ms));
  const clrT = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const reopen = deps.reopenDelayMs ?? 500;
  const dedupe = deps.dedupeWindowMs ?? 5000;

  let phase: VoicePhase = "off";
  let enabled = false;
  let rec: RecognizerLike | null = null;
  let gen = 0; // generation: callbacks from older recognizers are ignored
  let timers: unknown[] = [];
  let last = { text: "", at: -Infinity };
  let speakEndAt = 0;
  let botAudioActive = false;

  const set = (p: VoicePhase) => { phase = p; deps.onPhase(p); };
  const clearTimers = () => { timers.forEach(clrT); timers = []; };
  const killRec = () => {
    const r = rec; rec = null; gen++;
    if (r) { r.onresult = null; r.onerror = null; r.onend = null; try { r.abort(); } catch { /* stopped */ } }
  };

  const listen = () => {
    if (!enabled || phase === "thinking" || phase === "speaking" || phase === "waiting-end" || botAudioActive) return;
    if (!deps.createRecognizer) { set("unsupported"); return; }
    killRec();
    const my = gen;
    let r: RecognizerLike;
    try { r = deps.createRecognizer(); } catch { set("unsupported"); return; }
    r.lang = "he-IL"; r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
    let got = false;
    r.onresult = (e) => {
      if (my !== gen || !enabled) return;
      const res = e.results[e.results.length - 1];
      const t = res?.[0]?.transcript?.trim();
      if (!t) return;
      const n = normalizeUtterance(t);
      if (n === last.text && now() - last.at < dedupe) return; // duplicate/stale
      got = true;
      last = { text: n, at: now() };
      killRec();
      set("thinking");
      deps.onUtterance(t);
    };
    r.onerror = (e) => {
      if (my !== gen) return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { enabled = false; killRec(); set("denied"); }
    };
    r.onend = () => {
      if (my !== gen || got || !enabled) return;
      // Mobile Chrome ends after silence; restart loop (bounded by small delay).
      timers.push(setT(() => { if (my === gen) listen(); }, 300));
    };
    rec = r;
    try { r.start(); set("listening"); } catch { set("unsupported"); }
  };

  return {
    get phase() { return phase; },
    get enabled() { return enabled; },
    enable() { if (enabled) return; enabled = true; listen(); },
    disable() { enabled = false; clearTimers(); killRec(); set("off"); },
    /** Typed input path: stop listening and treat as an utterance. */
    submitTyped(t: string) {
      if (!t.trim()) return;
      killRec(); clearTimers(); last = { text: normalizeUtterance(t), at: now() };
      set("thinking"); deps.onUtterance(t.trim());
    },
    /** Ori audio is about to play for `seconds`. Mic stays closed. */
    botSpeaking(seconds: number) {
      killRec(); clearTimers(); botAudioActive = true;
      speakEndAt = Math.max(speakEndAt, now()) + seconds * 1000;
      set("speaking");
    },
    /** Called on Simli "silent" or when estimated playback ends. Reopens mic only once truly done. */
    botMaybeFinished() {
      if (phase !== "speaking" && phase !== "waiting-end") return;
      const remaining = speakEndAt - now();
      if (remaining > 0) {
        set("waiting-end");
        timers.push(setT(() => this.botMaybeFinished(), remaining + 50));
        return;
      }
      botAudioActive = false;
      timers.push(setT(() => { phase = "off"; if (enabled) listen(); else set("off"); }, reopen));
    },
    /** Turn produced no audio (error / text-only). */
    turnDone() { botAudioActive = false; speakEndAt = 0; phase = "off"; if (enabled) listen(); else set("off"); },
    destroy() { enabled = false; clearTimers(); killRec(); botAudioActive = false; },
  };
}

export type ChatTurn = { role: "user" | "assistant"; content: string };
export const HISTORY_MAX_TURNS = 8;
export const HISTORY_MAX_CHARS = 500;

/** Bounded recent history: last 8 user/assistant messages, 500 chars each. */
export function boundHistory(h: ChatTurn[]): ChatTurn[] {
  return h
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-HISTORY_MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, HISTORY_MAX_CHARS) }));
}

/** Split a reply into sentences so TTS can start on the first one. */
export function splitSentences(t: string): string[] {
  const parts = t.match(/[^.!?\n]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  return parts.length ? parts : [t.trim()].filter(Boolean);
}
