// Pure, testable core for the LiveAvatar custom-LLM bridge.
// No I/O, no env reads – the API route wraps this with auth, secrets and network.
import { instrumentRegistry, protocolRegistry, type SupportProtocol } from "./protocols";
import { checkSafety, type SafetyPolicy } from "./safety";
import { seedPatients } from "./fixtures";
import type { PatientProfile } from "./types";

export const BRIDGE_MODEL = "openai/gpt-6-astra";
export const MAX_MESSAGES = 50;
export const MAX_CONTENT_CHARS = 2000;
export const MAX_BODY_BYTES = 32 * 1024;

export interface BridgeMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BridgeRequest {
  model: string;
  messages: BridgeMessage[];
  stream: boolean;
}

/** Strict validation of an OpenAI chat-completions-shaped body. All input is untrusted. */
export function validateBridgeBody(body: unknown): BridgeRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const model = b["model"];
  const rawMessages = b["messages"];
  if (typeof model !== "string" || model.length > 120) return null;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0 || rawMessages.length > MAX_MESSAGES) return null;
  const messages: BridgeMessage[] = [];
  for (const m of rawMessages) {
    if (typeof m !== "object" || m === null) return null;
    const msg = m as Record<string, unknown>;
    const role = msg["role"];
    const content = msg["content"];
    if (role !== "system" && role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.length === 0 || content.length > MAX_CONTENT_CHARS) return null;
    messages.push({ role, content });
  }
  return { model: b["model"] as string, messages, stream: b["stream"] === true };
}

/** The last patient utterance – the only text that drives safety and protocol routing. */
export function lastUserText(messages: BridgeMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "user") return messages[i]!.content;
  }
  return "";
}

/**
 * Synthetic demo patient selection. A system message may carry a trusted marker
 * "patient_id: pX" that must match a fixture id; anything else is ignored and
 * the safe default (first synthetic profile) is used. Arbitrary real patient
 * data is never accepted.
 */
export function selectDemoPatient(messages: BridgeMessage[]): PatientProfile {
  const marker = messages
    .filter((m) => m.role === "system")
    .map((m) => /patient_id:\s*(p\d)/i.exec(m.content)?.[1])
    .find((x) => x !== undefined);
  const found = marker ? seedPatients.find((p) => p.id === marker) : undefined;
  return found ?? seedPatients[0]!;
}

/** Protocol activation by the patient's actual utterance (triggers), not only primaryTopic. */
export function matchProtocols(utterance: string, profile: PatientProfile): SupportProtocol[] {
  const t = utterance.replace(/[״"']/g, "");
  const triggered = protocolRegistry.filter((pr) => pr.triggers.some((tr) => t.includes(tr)));
  if (triggered.length) return triggered;
  const byProfile = profile.protocolIds
    .map((id) => protocolRegistry.find((pr) => pr.id === id))
    .filter((pr): pr is SupportProtocol => pr !== undefined);
  return byProfile.length ? byProfile : [];
}

/** System prompt: all six CBT support protocols, activated by utterance, with hard clinical boundaries. */
export function buildBridgeSystemPrompt(profile: PatientProfile, active: SupportProtocol[]): string {
  const allProtocols = protocolRegistry
    .map(
      (pr) =>
        `פרוטוקול "${pr.name}" (תחום: ${pr.domain}; טריגרים: ${pr.triggers.join(", ")}): טכניקות מותרות: ${pr.techniques.join(", ")}. שאלות מוצעות: ${pr.questions.join(" ")}. איסורים מוחלטים: ${pr.doNot.join(", ")}. גבולות: ${pr.boundaryTags.join(", ")}.`,
    )
    .join("\n");

  const activeText = active.length
    ? `לפי דברי המטופל כעת, הפרוטוקולים הרלוונטיים: ${active.map((p) => p.name).join("; ")}.`
    : "לא זוהה טריגר פרוטוקול בדברים האחרונים – שיחה תומכת כללית.";

  const achievements = profile.achievements.map((a) => a.text).join("; ") || "אין הישגים מאושרים עדיין";
  const goal = profile.goal ? `מטרה מאושרת: ${profile.goal.text}.` : "";

  const instrumentList = instrumentRegistry.map((i) => `"${i.name}" (${i.construct}; מדרג: ${i.rater})`).join(", ");

  return `אתה "אורי", מלווה שיחתי חם למטופל שיקום גריאטרי באשפוז. התשובות מוקראות בקול על ידי אווטאר – החזר טקסט מדובר בלבד, ללא JSON, ללא רשימות, ללא סימני עיצוב.
כל הנתונים סינתטיים (דמו) – אין מטופל אמיתי.
המטופל: ${profile.alias}, גיל ${profile.age}, ${profile.condition}.
הישגים שאושרו על ידי הצוות בלבד: ${achievements}. ${goal}
הערות מאושרות: ${profile.approvedNotes.join("; ")}.

${activeText}

מרשם הפרוטוקולים המלא (הפעל לפי תוכן דברי המטופל):
${allProtocols}

כללים מחייבים:
- ענה בעברית, בחום, 1-3 משפטים קצרים וטבעיים, מתאימים לדיבור.
- שאלה אחת בלבד בכל תשובה.
- לעולם אל תיתן ייעוץ רפואי, תרופתי או תרגילים חדשים; הפן לצוות בכל שאלה רפואית.
- ציין רק הישגים שאושרו על ידי הצוות – אל תמציא התקדמות.
- אם המטופל מתאמץ מעבר למדדים המאושרים – אמת את הרגש והפן לצוות, אל תאשר את הטענה.
- אם המטופל מדווח על כאב בחזה, קוצר נשימה, בלבול פתאומי, מחשבות אובדניות או פגיעה – הנחה אותו לקרוא לצוות מיד (בדיקה דטרמיניסטית נוספת רצה לפניך).

מדידה פסיכולוגית הקשרית – התחומים הזמינים: ${instrumentList}.
- שלב לכל היותר שאלת מדידה אחת רלוונטית בכל תשובה, באופן טבעי, לפי תוכן דברי המטופל והשיחה עד כה: פחד מנפילה → Short FES-I; מצב רוח ירוד → PHQ-2; חרדה/דאגה → GAD-2; רווחה כללית → WHO-5; בדידות → UCLA-3.
- PRPS מדורג על ידי הצוות בלבד – לעולם אל תשאל את המטופל שאלות PRPS ואל תדרג את השתתפותו.
- השאלות בשיחה הן פריטים מדומים ואינן הנוסח העברי המתוקף של הכלים: לעולם אל תחשב, תעריך או תציג ציון רשמי או תוצאה קלינית. כל מה שמותר הוא תובנה איכותנית בלבד, שתיוותר לשיקול דעת הצוות.`;
}

/** Deterministic safe fallback when the model is unavailable. Never claims to be live AI. */
export function fallbackReply(): string {
  return "אני כאן איתך. כרגע השירות החכם לא זמין, אז אני עונה מתשובות קבועות מראש. אם משהו מטריד אותך, בבקשה קרא/י לאחות או לאיש צוות.";
}

/** Safety runs BEFORE any model call; a hit short-circuits to the fixed safe response. */
export function safetyGate(utterance: string): SafetyPolicy | null {
  return checkSafety(utterance);
}

// ---- OpenAI-compatible response formatting ----

const completionId = () => `chatcmpl-${Math.random().toString(36).slice(2, 12)}`;

export function toChatCompletion(reply: string, model: string) {
  return {
    id: completionId(),
    object: "chat.completion" as const,
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant" as const, content: reply },
        finish_reason: "stop" as const,
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

/** One SSE delta chunk in OpenAI streaming format. */
export function sseDeltaChunk(id: string, model: string, content: string, finish: boolean): string {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: content ? { content } : {},
        finish_reason: finish ? "stop" : null,
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export const SSE_DONE = "data: [DONE]\n\n";

/** Split a full reply into word-level SSE deltas (spec-compliant; generation itself is not token-streamed). */
export function replyToSseStream(reply: string, model: string): string {
  const id = completionId();
  const words = reply.split(/(?<=\s)/).filter((w) => w.length > 0);
  const chunks = words.map((w) => sseDeltaChunk(id, model, w, false));
  chunks.push(sseDeltaChunk(id, model, "", true));
  chunks.push(SSE_DONE);
  return chunks.join("");
}
