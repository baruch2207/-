// Instant therapeutic micro-responses (reflection, validation, encouragement) spoken
// while the full AI reply is being prepared. Pure + deterministic; tone only, never diagnosis.
import type { VisualContext } from "./faceSignals";

export type AckKind = "validation" | "pacing" | "reengage" | "affirmation" | "reflection";

export const ACKS: Record<AckKind, string[]> = {
  validation: ["אני שומע אותך, זה באמת לא פשוט.", "מובן לגמרי שזה מאתגר."],
  pacing: ["בוא ניקח את זה לאט.", "אין לחץ, אנחנו ביחד בזה."],
  reengage: ["אני כאן איתך.", "רגע, אני מקשיב."],
  affirmation: ["כל הכבוד ששיתפת.", "יפה מאוד, זה חשוב."],
  reflection: ["אני מבין.", "הבנתי, תודה שסיפרת לי."],
};

const HARD = /(קשה|כואב|כאב|עייף|מפחד|פחד|דואג|לא מצליח|נמאס|עצוב|לבד)/;
const GOOD = /(הצלחתי|טוב|יותר טוב|הלכתי|עשיתי|שמח|תודה)/;

export function pickAckKind(text: string, v?: VisualContext | null): AckKind {
  if (v?.fatigue === "high") return "pacing";
  if (v?.strain === "high" || HARD.test(text)) return "validation";
  if (v?.engagement === "away") return "reengage";
  if (GOOD.test(text)) return "affirmation";
  return "reflection";
}

export function quickAck(text: string, v?: VisualContext | null, n = 0): { kind: AckKind; text: string } {
  const kind = pickAckKind(text, v);
  const list = ACKS[kind];
  return { kind, text: list[n % list.length]! };
}

/** Server-side hint: the patient already heard the micro-response, so go concrete. */
export const ACK_GUIDANCE =
  "\n\nהמטופל כבר שמע תגובת פתיחה קצרה (הדהוד/תיקוף/חיזוק). אל תפתח שוב באישור כללי — עבור מיד להתייחסות קונקרטית לדבריו, במשפט או שניים.";

/** Urgent/safety messages must never be preceded by a generic acknowledgement. */
import { checkSafety } from "./safety";
export function shouldAck(text: string): boolean {
  return !checkSafety(text);
}
