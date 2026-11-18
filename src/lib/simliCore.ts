// Pure, testable Simli logic. No network, no secrets, no browser globals.
// Simli is a VIDEO RENDERER only: it does not do ASR, LLM or TTS.

export const SIMLI_MAX_SESSION_SECONDS = 60;
export const SIMLI_MAX_IDLE_SECONDS = 30;
/** Public sample face from Simli docs. Does NOT reproduce Ori's photo or the "ביחד" cap. */
export const SIMLI_DEMO_FACE_ID = "bf13113a-355a-4d97-8b90-4edccd1da7b2";
export const SIMLI_SAMPLE_RATE = 16000;

const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveFaceId(envFaceId: string | undefined): { faceId: string; isDemoFace: boolean } {
  const v = envFaceId?.trim();
  if (v && UUIDISH.test(v)) return { faceId: v, isDemoFace: false };
  return { faceId: SIMLI_DEMO_FACE_ID, isDemoFace: true };
}

/** Token config with server-enforced cost caps (never more than 60s / 30s idle). */
export function buildSimliTokenConfig(faceId: string) {
  return {
    faceId,
    handleSilence: true,
    maxSessionLength: SIMLI_MAX_SESSION_SECONDS,
    maxIdleTime: SIMLI_MAX_IDLE_SECONDS,
    audioInputFormat: "pcm16",
  };
}

export interface SimliStatusInput {
  apiKeyConfigured: boolean;
  rotationConfirmed: boolean;
  faceIdConfigured: boolean;
  ttsAvailable?: boolean;
}
/** Paid sessions are allowed only after the exposed key was rotated and acknowledged. */
export function canStartPaidSession(s: SimliStatusInput, billingAcknowledged: boolean): boolean {
  return s.apiKeyConfigured && s.rotationConfirmed && billingAcknowledged;
}

// ---------- Audio: WAV -> PCM16 mono 16 kHz ----------

export interface PcmInfo { sampleRate: number; channels: number; bitsPerSample: number; data: Uint8Array }

export function parseWav(bytes: Uint8Array): PcmInfo {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o] ?? 0, bytes[o + 1] ?? 0, bytes[o + 2] ?? 0, bytes[o + 3] ?? 0);
  if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV file");
  let off = 12;
  let fmt: Omit<PcmInfo, "data"> | null = null;
  while (off + 8 <= bytes.length) {
    const id = tag(off);
    let size = dv.getUint32(off + 4, true);
    const body = off + 8;
    if (id === "fmt ") {
      fmt = { channels: dv.getUint16(body + 2, true), sampleRate: dv.getUint32(body + 4, true), bitsPerSample: dv.getUint16(body + 14, true) };
    } else if (id === "data") {
      if (!fmt) throw new Error("WAV data before fmt");
      // Streaming WAVs may declare 0 / 0xFFFFFFFF sizes.
      if (size === 0 || body + size > bytes.length) size = bytes.length - body;
      return { ...fmt, data: bytes.subarray(body, body + size) };
    }
    off = body + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

/** Converts 16-bit PCM (any rate/channels) to mono 16 kHz PCM16 little-endian. */
export function toPcm16Mono16k(info: PcmInfo): Uint8Array {
  if (info.bitsPerSample !== 16) throw new Error("only 16-bit PCM supported");
  const frames = Math.floor(info.data.length / (2 * info.channels));
  const dv = new DataView(info.data.buffer, info.data.byteOffset, info.data.byteLength);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < info.channels; c++) sum += dv.getInt16((i * info.channels + c) * 2, true);
    mono[i] = sum / info.channels;
  }
  const ratio = info.sampleRate / SIMLI_SAMPLE_RATE;
  const outLen = Math.floor(frames / ratio);
  const out = new Uint8Array(outLen * 2);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, frames - 1);
    const a = mono[i0] ?? 0;
    const v = a + ((mono[i1] ?? 0) - a) * (pos - i0);
    odv.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(v))), true);
  }
  return out;
}

export function chunkPcm(pcm: Uint8Array, chunkBytes = 6000): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += chunkBytes) out.push(pcm.subarray(i, i + chunkBytes));
  return out;
}

// ---------- Hebrew error classification (never echoes raw details) ----------

export type SimliErrorKind = "token" | "auth" | "face" | "webrtc" | "mic" | "tts" | "rotation" | "unknown";

export function classifySimliError(err: unknown): { kind: SimliErrorKind; title: string; detail: string } {
  const raw = (err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "")).toLowerCase();
  if (/rotat/.test(raw)) return { kind: "rotation", title: "יש להחליף את מפתח Simli", detail: "המפתח הנוכחי נחשף בצ'אט. בטלו אותו ב־Simli, צרו חדש ושמרו אותו בטופס המאובטח לפני כל סשן." };
  if (/notallowed|permission|denied.*micro|microphone/.test(raw)) return { kind: "mic", title: "אין הרשאת מיקרופון", detail: "אפשרו מיקרופון בהגדרות האתר ב־Chrome, או הקלידו טקסט." };
  if (/401|403|unauthor|forbidden|api key|invalid key/.test(raw)) return { kind: "auth", title: "Simli דחה את המפתח", detail: "המפתח בשרת אינו תקף או בוטל. החליפו אותו בטופס המאובטח." };
  if (/face/.test(raw)) return { kind: "face", title: "מזהה הפנים (Face ID) לא נמצא", detail: "בדקו את SIMLI_FACE_ID בחשבון Simli, או השאירו ריק לשימוש בפנים לדוגמה." };
  if (/tts|speech|wav|audio/.test(raw)) return { kind: "tts", title: "יצירת הקול נכשלה", detail: "שירות הקול בשרת לא החזיר שמע. התשובה מוצגת כטקסט בלבד." };
  if (/webrtc|ice|livekit|peer|connection|websocket|timeout/.test(raw)) return { kind: "webrtc", title: "חיבור הווידאו החי נכשל", detail: "לא ניתן להשלים חיבור WebRTC; ייתכן שהגורם הוא רשת/VPN או שירות הסטרימינג. הסיבה המדויקת לא אומתה." };
  if (/token|session/.test(raw)) return { kind: "token", title: "יצירת סשן Simli נכשלה", detail: "השרת לא הצליח לקבל אסימון סשן מ־Simli. נסו שוב מאוחר יותר." };
  return { kind: "unknown", title: "שגיאה לא צפויה", detail: "הסשן נעצר. אפשר לנסות שוב." };
}

/** Approximate billable minutes for local cost tracking (rounded up per started minute). */
export function billableMinutes(seconds: number): number {
  return seconds <= 0 ? 0 : Math.ceil(seconds / 60);
}
