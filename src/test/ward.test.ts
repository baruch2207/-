import { describe, expect, it } from "vitest";
import { seedPatients } from "@/lib/fixtures";
import {
  currentIndex, dailySchedule, evaluateCheckIn, greetingByHour, helpOptions, helpRequest, progressSummary, stayDay, type CheckIn,
} from "@/lib/ward";
import { resolveSimliCaps, buildSimliTokenConfig, SIMLI_PATIENT_HARD_MAX_SESSION_SECONDS } from "@/lib/simliCore";

const p1 = seedPatients[0]!; // hip fracture, week2
const p6 = seedPatients[5]!; // admission phase
const at = (h: number, m = 0) => new Date(2026, 10, 18, h, m);
const ci = (o: Partial<CheckIn>): CheckIn => ({ id: "c", patientId: p1.id, at: "2026-11-18T08:00:00.000Z", mood: 3, pain: "none", sleep: "good", ...o });

describe("bedside schedule", () => {
  it("is sorted by time and includes physio for orthopedic patients", () => {
    const s = dailySchedule(p1);
    expect(s.map((x) => x.time)).toEqual([...s.map((x) => x.time)].sort());
    expect(s.some((x) => x.kind === "therapy" && x.title === "פיזיותרפיה")).toBe(true);
  });
  it("has no corridor walk in the admission phase", () => {
    expect(dailySchedule(p6).some((x) => x.title.includes("הליכה במסדרון"))).toBe(false);
  });
  it("highlights the running item, then the next one, and -1 after the day ends", () => {
    const s = dailySchedule(p1);
    expect(s[currentIndex(s, at(8, 20))]!.title).toBe("ארוחת בוקר");
    expect(s[currentIndex(s, at(6, 0))]!.time).toBe("07:30");
    expect(currentIndex(s, at(23, 30))).toBe(-1);
  });
  it("greets by hour and counts stay days from admission", () => {
    expect(greetingByHour(at(9))).toBe("בוקר טוב");
    expect(greetingByHour(at(19))).toBe("ערב טוב");
    expect(stayDay({ ...p1, admittedAt: "2026-11-16T10:00:00.000Z" }, new Date("2026-11-18T12:00:00.000Z"))).toBe(3);
  });
});

describe("daily check-in", () => {
  it("severe pain alerts the nurse with high priority", () => {
    const r = evaluateCheckIn(p1, ci({ pain: "severe" }));
    expect(r.alert?.priority).toBe("high");
    expect(r.alert?.targetRole).toBe("אח/ות");
    expect(r.alert?.status).toBe("open");
  });
  it("very low mood alerts the psychologist", () => {
    const r = evaluateCheckIn(p1, ci({ mood: 1 }));
    expect(r.alert?.targetRole).toBe("פסיכולוג/ית");
  });
  it("severe pain wins over low mood for the single alert", () => {
    expect(evaluateCheckIn(p1, ci({ mood: 1, pain: "severe" })).alert?.targetRole).toBe("אח/ות");
  });
  it("a good day raises no alert", () => {
    const r = evaluateCheckIn(p1, ci({ mood: 5 }));
    expect(r.alert).toBeNull();
    expect(r.reply.length).toBeGreaterThan(0);
  });
});

describe("help requests", () => {
  it("every option builds an open help_request alert for this patient", () => {
    for (const h of helpOptions) {
      const r = helpRequest(p1, h.kind, "2026-11-18T08:00:00.000Z");
      expect(r.alert.category).toBe("help_request");
      expect(r.alert.patientId).toBe(p1.id);
      expect(r.alert.status).toBe("open");
      expect(r.reply).toBeTruthy();
    }
  });
  it("toilet help is high priority (fall risk) and tells the patient not to get up alone", () => {
    const r = helpRequest(p1, "toilet");
    expect(r.alert.priority).toBe("high");
    expect(r.reply).toContain("אל תקומו לבד");
  });
});

describe("progress", () => {
  it("reports improvement when FIM rose", () => expect(progressSummary(p1).trend).toBe("up"));
  it("treats a single data point as a start", () => expect(progressSummary(p6).trend).toBe("start"));
});

describe("Simli patient caps", () => {
  it("test mode is always 60/30", () => {
    expect(resolveSimliCaps("test", { SIMLI_PATIENT_MAX_SESSION_SECONDS: "500" })).toEqual({ maxSessionLength: 60, maxIdleTime: 30 });
  });
  it("patient mode defaults to 300/60", () => {
    expect(resolveSimliCaps("patient", {})).toEqual({ maxSessionLength: 300, maxIdleTime: 60 });
  });
  it("patient env overrides are clamped to the hard max", () => {
    const c = resolveSimliCaps("patient", { SIMLI_PATIENT_MAX_SESSION_SECONDS: "99999", SIMLI_PATIENT_MAX_IDLE_SECONDS: "1" });
    expect(c.maxSessionLength).toBe(SIMLI_PATIENT_HARD_MAX_SESSION_SECONDS);
    expect(c.maxIdleTime).toBe(15);
  });
  it("token config carries the caps", () => {
    const t = buildSimliTokenConfig("x", resolveSimliCaps("patient", {}));
    expect(t.maxSessionLength).toBe(300);
    expect(buildSimliTokenConfig("x").maxSessionLength).toBe(60);
  });
});
