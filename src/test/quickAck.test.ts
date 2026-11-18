import { describe, it, expect } from "vitest";
import { pickAckKind, quickAck } from "@/lib/quickAck";

const n = { strain: "normal", fatigue: "normal", engagement: "focused" } as const;
describe("quickAck", () => {
  it("fatigue → pacing", () => expect(pickAckKind("שלום", { ...n, fatigue: "high" })).toBe("pacing"));
  it("strain → validation", () => expect(pickAckKind("שלום", { ...n, strain: "high" })).toBe("validation"));
  it("hard words → validation", () => expect(pickAckKind("קשה לי היום")).toBe("validation"));
  it("looking away → reengage", () => expect(pickAckKind("כן", { ...n, engagement: "away" })).toBe("reengage"));
  it("success → affirmation", () => expect(pickAckKind("הצלחתי ללכת")).toBe("affirmation"));
  it("default → reflection", () => expect(quickAck("כן").kind).toBe("reflection"));
});

import { shouldAck } from "@/lib/quickAck";
describe("ack before urgent", () => {
  it("skips the acknowledgement for chest pain", () => { expect(shouldAck("יש לי כאב בחזה")).toBe(false); });
  it("allows it for ordinary messages", () => { expect(shouldAck("היום היה בסדר")).toBe(true); });
});
