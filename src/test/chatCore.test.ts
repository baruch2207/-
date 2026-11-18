import { describe, expect, it } from "vitest";
import { buildSystemPrompt, extractOutputText, parseModelJson, safetyFirst } from "@/lib/chatCore";
import { seedPatients } from "@/lib/fixtures";

const p1 = seedPatients.find((p) => p.id === "p1");
if (!p1) throw new Error("missing fixture p1");

describe("server chat core", () => {
  it("system prompt includes protocol boundaries and absolute prohibitions", () => {
    const prompt = buildSystemPrompt(p1);
    expect(prompt).toContain("FIT-HIP");
    expect(prompt).toContain("איסורים מוחלטים");
    expect(prompt).toContain("לא להציע תרגילים חדשים");
    expect(prompt).toContain("סינתטיים");
  });

  it("system prompt only cites clinician-approved achievements", () => {
    const prompt = buildSystemPrompt(p1);
    expect(prompt).toContain("הלכת 25 מטר עם הליכון");
    expect(prompt).toContain("אושרו על ידי הצוות בלבד");
  });

  it("safety short-circuits before any model call", () => {
    expect(safetyFirst("יש לי כאב בחזה")?.id).toBe("SP-CHEST");
    expect(safetyFirst("אני לא רוצה לחיות")?.id).toBe("SP-SUICIDE");
    expect(safetyFirst("איך עובר היום?")).toBeNull();
  });

  it("parses model JSON tolerantly and rejects garbage", () => {
    expect(parseModelJson('{"reply":"שלום","quickReplies":["א","ב"]}')).toEqual({ reply: "שלום", quickReplies: ["א", "ב"] });
    expect(parseModelJson('הנה: {"reply":"בסדר"} תודה')).toEqual({ reply: "בסדר", quickReplies: [] });
    expect(parseModelJson("no json here")).toBeNull();
    expect(parseModelJson('{"quickReplies":[]}')).toBeNull();
  });

  it("extracts text from Responses API shapes", () => {
    expect(extractOutputText({ output_text: "שלום" })).toBe("שלום");
    expect(
      extractOutputText({ output: [{ type: "message", content: [{ type: "output_text", text: "היי" }] }] }),
    ).toBe("היי");
    expect(extractOutputText({ output: [] })).toBe("");
  });
});
