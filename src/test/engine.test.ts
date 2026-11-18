import { describe, expect, it } from "vitest";
import { emptyMemory, respond } from "@/lib/engine";
import { seedPatients, testScripts } from "@/lib/fixtures";
import { QUIZ_TRIGGER, quizForTopic } from "@/lib/questionnaire";
import { protocolRegistry } from "@/lib/protocols";

const patient = (id: string) => {
  const p = seedPatients.find((x) => x.id === id);
  if (!p) throw new Error(`missing fixture ${id}`);
  return p;
};

describe("safety routing (test scripts)", () => {
  for (const t of testScripts.filter((x) => x.expect === "safety")) {
    it(`${t.id}: "${t.title}" creates a ${t.expectValue} alert`, () => {
      const r = respond(patient(t.patientId), emptyMemory(), t.input);
      expect(r.alert?.category).toBe(t.expectValue);
      expect(r.reply.safety).toBe(true);
    });
  }
});

describe("topic routing (test scripts)", () => {
  for (const t of testScripts.filter((x) => x.expect === "topic")) {
    it(`${t.id}: "${t.title}" routes to topic ${t.expectValue}`, () => {
      const r = respond(patient(t.patientId), emptyMemory(), t.input);
      expect(r.alert).toBeUndefined();
      expect(r.reply.rationale?.topic).toBe(t.expectValue);
    });
  }
});

describe("verification (test scripts)", () => {
  for (const t of testScripts.filter((x) => x.expect === "verification")) {
    it(`${t.id}: "${t.title}" flags a verification alert without overriding metrics`, () => {
      const r = respond(patient(t.patientId), emptyMemory(), t.input);
      expect(r.alert?.category).toBe("verification");
    });
  }
});

describe("questionnaire engine in chat", () => {
  it("offers a demo quiz only for topics with a patient-rated instrument", () => {
    expect(quizForTopic("mood")).not.toBeNull();
    expect(quizForTopic("fear_falling")).not.toBeNull();
    expect(quizForTopic("loneliness")).not.toBeNull();
    expect(quizForTopic("pain")).toBeNull();
    expect(quizForTopic("general")).toBeNull();
  });

  it("administers demo items as chat prompts and never produces a numeric score", () => {
    const p = patient("p2"); // primaryTopic: mood → PHQ-2 demo items
    let mem = emptyMemory();
    let r = respond(p, mem, QUIZ_TRIGGER);
    mem = r.memory;
    expect(mem.quiz).not.toBeNull();
    expect(r.reply.text).toContain("מדומים");

    r = respond(p, mem, "קצת");
    mem = r.memory;
    expect(mem.quiz).not.toBeNull();

    r = respond(p, mem, "די הרבה");
    mem = r.memory;
    expect(mem.quiz).toBeNull();

    const fact = mem.facts.find((f) => f.key.startsWith("quiz-"));
    expect(fact).toBeDefined();
    expect(fact?.source).toBe("patient-testimony");
    expect(fact?.value).toContain("תובנה איכותנית");
    expect(fact?.value).toContain("לא ציון מתוקף");
    // No numeric score anywhere in the recorded insight
    expect(fact?.value).not.toMatch(/ציון[: ]*\d/);
  });
});

describe("protocol registry", () => {
  it("preserves the 6 original clinical protocol entries", () => {
    expect(protocolRegistry).toHaveLength(6);
    expect(protocolRegistry.map((p) => p.id)).toEqual([
      "fit-hip",
      "step-by-step",
      "acbt-stroke",
      "brief-cbt-stroke-inpatient",
      "cbt-tka",
      "mdt-cbt-chronic-pain",
    ]);
  });
});
