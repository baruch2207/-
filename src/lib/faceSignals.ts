// Pure, testable aggregation of on-device face blendshapes into soft conversation cues.
// Not a diagnosis: cues only shape Ori's tone (gentle check-in), never clinical conclusions.
export type Level = "normal" | "high";
export interface VisualContext { strain: Level; fatigue: Level; engagement: "focused" | "away" }
export interface FaceSample { t: number; present: boolean; browDown: number; eyeBlink: number; smile: number; yawAbs: number; pitchDown: number }

export const WINDOW_MS = 4000;
const STRAIN_T = 0.45, BLINK_T = 0.55, AWAY_YAW = 0.35, AWAY_PITCH = 0.35;

export function pushSample(buf: FaceSample[], s: FaceSample): FaceSample[] {
  const next = [...buf, s].filter((x) => s.t - x.t <= WINDOW_MS);
  return next.slice(-40); // bounded memory
}

/** Requires ≥60% of the window to exceed thresholds — single blinks/frowns never trigger. */
export function aggregate(buf: FaceSample[]): VisualContext | null {
  if (buf.length < 6) return null;
  const present = buf.filter((s) => s.present);
  if (present.length / buf.length < 0.4) return { strain: "normal", fatigue: "normal", engagement: "away" };
  const frac = (f: (s: FaceSample) => boolean) => present.filter(f).length / present.length;
  return {
    strain: frac((s) => s.browDown > STRAIN_T) >= 0.6 ? "high" : "normal",
    fatigue: frac((s) => s.eyeBlink > BLINK_T) >= 0.6 ? "high" : "normal",
    engagement: frac((s) => s.yawAbs > AWAY_YAW || s.pitchDown > AWAY_PITCH) >= 0.6 ? "away" : "focused",
  };
}

/** Server-side: turns validated cues into tone guidance. No camera claims to the patient. */
export function visualGuidance(v: VisualContext | undefined): string {
  if (!v) return "";
  const out: string[] = [];
  if (v.strain === "high") out.push("סימני מאמץ בפנים: שאל בעדינות איך התחושה והצע עצירה לנשימה. אל תאבחן כאב.");
  if (v.fatigue === "high") out.push("סימני עייפות: קצר משפטים והצע הפסקה קצרה בישיבה.");
  if (v.engagement === "away") out.push("ייתכן שהמטופל מוסח: פנה אליו בשמו בעדינות ובמשפט קצר.");
  if (!out.length) return "";
  return `\n\nרמזים חזותיים מקומיים (לא אבחנה, אל תזכיר מצלמה או זיהוי): ${out.join(" ")}`;
}
