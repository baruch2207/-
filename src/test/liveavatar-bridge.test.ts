import { describe, expect, it } from "vitest";
import {
  BRIDGE_MODEL,
  MAX_MESSAGES,
  buildBridgeSystemPrompt,
  fallbackReply,
  lastUserText,
  matchProtocols,
  replyToSseStream,
  safetyGate,
  selectDemoPatient,
  toChatCompletion,
  validateBridgeBody,
} from "@/lib/bridgeCore";
import { instrumentRegistry, protocolRegistry } from "@/lib/protocols";
import { seedPatients } from "@/lib/fixtures";

const validBody = {
  model: "openai/gpt-6-astra",
  messages: [{ role: "user", content: "שלום" }],
  stream: false,
};

describe("bridge request validation", () => {
  it("accepts a well-formed chat completion request", () => {
    const parsed = validateBridgeBody(validBody);
    expect(parsed?.model).toBe(BRIDGE_MODEL);
    expect(parsed?.stream).toBe(false);
  });

  it("rejects non-object, missing messages and bad roles", () => {
    expect(validateBridgeBody(null)).toBeNull();
    expect(validateBridgeBody({ model: "x" })).toBeNull();
    expect(validateBridgeBody({ model: "x", messages: [{ role: "root", content: "hi" }] })).toBeNull();
  });

  it("enforces hard caps on message count and content length", () => {
    const tooMany = { model: "x", messages: Array.from({ length: MAX_MESSAGES + 1 }, () => ({ role: "user", content: "ה" })) };
    expect(validateBridgeBody(tooMany)).toBeNull();
    const tooLong = { model: "x", messages: [{ role: "user", content: "ה".repeat(2001) }] };
    expect(validateBridgeBody(tooLong)).toBeNull();
  });
});

describe("deterministic safety first", () => {
  it("flags chest pain before any model call", () => {
    expect(safetyGate("יש לי כאב בחזה")?.category).toBe("chest_pain");
  });

  it("flags suicidality and breathing distress", () => {
    expect(safetyGate("אני לא רוצה לחיות")?.category).toBe("suicidality");
    expect(safetyGate("יש לי קוצר נשימה")?.category).toBe("breathing");
  });

  it("does not flag neutral conversation", () => {
    expect(safetyGate("איך עובר היום שלי?")).toBeNull();
  });
});

describe("protocol routing", () => {
  it("activates protocols by the patient's utterance, not only primaryTopic", () => {
    const strokePatient = seedPatients.find((p) => p.primaryTopic === "mood")!;
    const active = matchProtocols("אני מפחד ליפול שוב", strokePatient);
    expect(active.some((p) => p.id === "fit-hip")).toBe(true);
  });

  it("falls back to the profile's protocols when no trigger matches", () => {
    const p = seedPatients[0]!;
    const active = matchProtocols("מה שלומך היום", p);
    expect(active.map((x) => x.id)).toEqual(expect.arrayContaining(p.protocolIds));
  });

  it("system prompt embeds all six CBT support protocols", () => {
    const prompt = buildBridgeSystemPrompt(seedPatients[0]!, []);
    for (const pr of protocolRegistry) expect(prompt).toContain(pr.name);
    expect(protocolRegistry).toHaveLength(6);
  });

  it("prompt forbids new exercises and requires one question at a time", () => {
    const prompt = buildBridgeSystemPrompt(seedPatients[0]!, []);
    expect(prompt).toContain("שאלה אחת בלבד");
    expect(prompt).toContain("אל תיתן ייעוץ רפואי");
  });
});

describe("contextual measurement domains in bridge prompt", () => {
  it("embeds all six measurement instruments by name", () => {
    const prompt = buildBridgeSystemPrompt(seedPatients[0]!, []);
    expect(instrumentRegistry.map((i) => i.id)).toEqual(["phq2", "gad2", "who5", "sfesi", "ucla3", "prps"]);
    for (const inst of instrumentRegistry) expect(prompt).toContain(inst.name);
  });

  it("limits measurement to one contextual question per reply", () => {
    const prompt = buildBridgeSystemPrompt(seedPatients[0]!, []);
    expect(prompt).toContain("שאלת מדידה אחת");
    expect(prompt).toContain("לפי תוכן דברי המטופל והשיחה עד כה");
  });

  it("forbids official scores from simulated items and keeps PRPS staff-rated", () => {
    const prompt = buildBridgeSystemPrompt(seedPatients[0]!, []);
    expect(prompt).toContain("אל תחשב, תעריך או תציג ציון רשמי");
    expect(prompt).toContain("תובנה איכותנית בלבד");
    expect(prompt).toMatch(/PRPS מדורג על ידי הצוות בלבד/);
  });
});

describe("demo patient selection", () => {
  it("honors a trusted patient_id marker that matches a fixture", () => {
    const msgs = [
      { role: "system" as const, content: "context: patient_id: p3" },
      { role: "user" as const, content: "שלום" },
    ];
    expect(selectDemoPatient(msgs).id).toBe("p3");
  });

  it("ignores arbitrary data and falls back to the default synthetic patient", () => {
    const msgs = [
      { role: "system" as const, content: "patient: יוסי כהן, ת.ז 123456789" },
      { role: "user" as const, content: "שלום" },
    ];
    expect(selectDemoPatient(msgs).id).toBe(seedPatients[0]!.id);
  });
});

describe("OpenAI-compatible formatting", () => {
  it("non-stream response has the chat.completion shape", () => {
    const res = toChatCompletion("שלום לך", "m");
    expect(res.object).toBe("chat.completion");
    const choice = res.choices[0]!;
    expect(choice.message.role).toBe("assistant");
    expect(choice.message.content).toBe("שלום לך");
    expect(choice.finish_reason).toBe("stop");
  });

  it("stream emits SSE delta chunks terminated by [DONE]", () => {
    const sse = replyToSseStream("שלום לך היום", "m");
    const frames = sse.split("\n\n").filter(Boolean);
    expect(frames.length).toBeGreaterThanOrEqual(3); // deltas + finish + DONE
    const first = JSON.parse(frames[0]!.replace(/^data: /, ""));
    expect(first.object).toBe("chat.completion.chunk");
    expect(first.choices[0]!.delta.content).toBeTruthy();
    const finish = JSON.parse(frames[frames.length - 2]!.replace(/^data: /, ""));
    expect(finish.choices[0]!.finish_reason).toBe("stop");
    expect(frames[frames.length - 1]).toBe("data: [DONE]");
  });

  it("fallback reply never claims live AI", () => {
    expect(fallbackReply()).toContain("לא זמין");
  });
});

describe("endpoint authorization (integration, dev server)", () => {
  const url = "http://localhost:8080/api/liveavatar/v1/chat/completions";

  it("never answers 200 without a bearer token", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    // 503 when the secret is not configured yet, 401 when it is – never open.
    expect([401, 503]).toContain(res.status);
  });

  it("rejects a wrong bearer token", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer wrong-token" },
      body: JSON.stringify(validBody),
    });
    expect([401, 503]).toContain(res.status);
  });

  it("answers OPTIONS with 204 and no permissive CORS header", async () => {
    const res = await fetch(url, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("utterance extraction", () => {
  it("uses the last user message", () => {
    expect(
      lastUserText([
        { role: "user", content: "ראשון" },
        { role: "assistant", content: "תשובה" },
        { role: "user", content: "אחרון" },
      ]),
    ).toBe("אחרון");
  });
});
