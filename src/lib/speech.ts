// Browser speech helpers. All calls must run in effects/handlers only.
export type ListenStatus = "idle" | "listening" | "unsupported" | "denied" | "error" | "no-speech";

export function ttsSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, rate: number, onStart: () => void, onEnd: () => void, queue = false) {
  if (!ttsSupported()) { onEnd(); return; }
  const synth = window.speechSynthesis;
  if (!queue) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "he-IL";
  u.rate = rate;
  const voice = synth.getVoices().find((v) => v.lang.startsWith("he") || v.lang.startsWith("iw"));
  if (voice) u.voice = voice;
  u.onstart = onStart;
  u.onend = onEnd;
  u.onerror = onEnd;
  synth.speak(u);
}

export function hasHebrewVoice() {
  return ttsSupported() && window.speechSynthesis.getVoices().some((v) => v.lang.startsWith("he") || v.lang.startsWith("iw"));
}

export function pauseSpeech() { if (ttsSupported()) window.speechSynthesis.pause(); }
export function resumeSpeech() { if (ttsSupported()) window.speechSynthesis.resume(); }
export function stopSpeech() { if (ttsSupported()) window.speechSynthesis.cancel(); }

interface RecLike { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void;
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; }

export function recognitionSupported() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w["SpeechRecognition"] || w["webkitSpeechRecognition"]);
}

export function listenOnce(onText: (t: string) => void, onStatus: (s: ListenStatus) => void): () => void {
  const w = window as unknown as Record<string, new () => RecLike>;
  const Ctor = w["SpeechRecognition"] || w["webkitSpeechRecognition"];
  if (!Ctor) { onStatus("unsupported"); return () => {}; }
  let rec: RecLike;
  try { rec = new Ctor(); } catch { onStatus("error"); return () => {}; }
  rec.lang = "he-IL"; rec.interimResults = false; rec.maxAlternatives = 1;
  let got = false;
  rec.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) { got = true; onText(t); } };
  rec.onerror = (e) => onStatus(e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied" : e.error === "no-speech" ? "no-speech" : "error");
  rec.onend = () => { if (got) onStatus("idle"); };
  try { rec.start(); onStatus("listening"); } catch { onStatus("error"); }
  return () => { try { rec.stop(); } catch { /* already stopped */ } };
}
