import { describe, it, expect } from "vitest";
import { aggregate, pushSample, visualGuidance, type FaceSample } from "@/lib/faceSignals";

const base: Omit<FaceSample, "t"> = { present: true, browDown: 0, eyeBlink: 0, smile: 0, yawAbs: 0, pitchDown: 0 };
const fill = (n: number, f: (i: number) => Partial<FaceSample>) => {
  let b: FaceSample[] = [];
  for (let i = 0; i < n; i++) b = pushSample(b, { ...base, t: i * 250, ...f(i) });
  return b;
};

describe("face signals", () => {
  it("sustained brow-down flags strain", () => expect(aggregate(fill(12, () => ({ browDown: 0.7 })))?.strain).toBe("high"));
  it("a single blink does not flag fatigue", () => expect(aggregate(fill(12, (i) => ({ eyeBlink: i === 5 ? 0.9 : 0 })))?.fatigue).toBe("normal"));
  it("no face most of the time = away", () => expect(aggregate(fill(12, () => ({ present: false })))?.engagement).toBe("away"));
  it("too few samples gives nothing", () => expect(aggregate(fill(3, () => ({})))).toBeNull());
  it("window keeps only last 4s", () => expect(fill(40, () => ({})).length).toBeLessThanOrEqual(17));
  it("guidance never diagnoses or mentions camera to patient", () => {
    const g = visualGuidance({ strain: "high", fatigue: "high", engagement: "away" });
    expect(g).toContain("אל תאבחן");
    expect(g).toContain("אל תזכיר מצלמה");
    expect(visualGuidance({ strain: "normal", fatigue: "normal", engagement: "focused" })).toBe("");
  });
});
