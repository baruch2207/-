// Pure logic for the patient's bedside app during the ward stay.
// SYNTHETIC DEMO ONLY: schedules and check-ins are invented, never real PHI.
import type { AlertPriority, ClinicianRole, DemoAlert, PatientProfile, SafetyCategory } from "./types";

// ---------- Daily schedule ----------

export type ScheduleKind = "therapy" | "meal" | "medical" | "social" | "rest";
export interface ScheduleItem {
  time: string; // "HH:MM"
  title: string;
  detail?: string;
  kind: ScheduleKind;
  icon: string;
}

const BASE: ScheduleItem[] = [
  { time: "07:30", title: "השכמה ורחצה", detail: "האחות או המטפל יעזרו לפי הצורך", kind: "medical", icon: "🌅" },
  { time: "08:15", title: "ארוחת בוקר", kind: "meal", icon: "🍞" },
  { time: "09:00", title: "סבב רופאים", detail: "אפשר לשאול כל שאלה", kind: "medical", icon: "🩺" },
  { time: "12:30", title: "ארוחת צהריים", kind: "meal", icon: "🍲" },
  { time: "13:30", title: "מנוחה", kind: "rest", icon: "😴" },
  { time: "16:00", title: "שעת ביקורים", detail: "משפחה וחברים מוזמנים", kind: "social", icon: "👨‍👩‍👧" },
  { time: "18:00", title: "ארוחת ערב", kind: "meal", icon: "🥗" },
  { time: "21:00", title: "תרופות ערב והכנה לשינה", kind: "medical", icon: "🌙" },
];

/** Therapy slots depend on the (synthetic) condition and phase. Deterministic per patient. */
function therapyFor(p: PatientProfile): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const physio = /ירך|אגן|ברך|חולשה|דלקת/.test(p.condition);
  const ot = /מוחי/.test(p.condition);
  if (physio || p.phase !== "admission") {
    items.push({ time: "10:00", title: "פיזיותרפיה", detail: "בחדר הכושר של המחלקה, עם הפיזיותרפיסט/ית", kind: "therapy", icon: "🚶" });
  }
  if (ot) items.push({ time: "11:00", title: "ריפוי בעיסוק", detail: "תרגול יד ופעולות יומיום", kind: "therapy", icon: "✋" });
  if (p.primaryTopic === "mood" || p.primaryTopic === "loneliness") {
    items.push({ time: "14:30", title: "פעילות קבוצתית", detail: "מוזיקה ושיחה בחדר האוכל", kind: "social", icon: "🎵" });
  }
  if (p.phase !== "admission") items.push({ time: "15:00", title: "תרגול שני – הליכה במסדרון", detail: "רק בליווי איש צוות", kind: "therapy", icon: "🦯" });
  if (p.phase === "discharge") items.push({ time: "11:30", title: "שיחת תכנון שחרור", detail: "עם העובדת הסוציאלית", kind: "social", icon: "🏠" });
  return items;
}

export function dailySchedule(p: PatientProfile): ScheduleItem[] {
  return [...BASE, ...therapyFor(p)].sort((a, b) => a.time.localeCompare(b.time));
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Index of the current/next item: the last item that started within 45 minutes, else the next one. */
export function currentIndex(schedule: ScheduleItem[], now: Date): number {
  const t = now.getHours() * 60 + now.getMinutes();
  let idx = -1;
  for (let i = 0; i < schedule.length; i++) {
    const start = minutes(schedule[i]!.time);
    if (start <= t && t - start < 45) idx = i;
  }
  if (idx >= 0) return idx;
  const next = schedule.findIndex((s) => minutes(s.time) > t);
  return next; // -1 = day is over
}

export function stayDay(p: PatientProfile, now: Date): number {
  const ms = now.getTime() - new Date(p.admittedAt).getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

export function greetingByHour(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}

// ---------- Daily check-in ----------

export type Mood = 1 | 2 | 3 | 4 | 5; // 1 = very bad
export type PainLevel = "none" | "mild" | "moderate" | "severe";
export type Sleep = "good" | "so-so" | "bad";

export interface CheckIn {
  id: string;
  patientId: string;
  at: string;
  mood: Mood;
  pain: PainLevel;
  sleep: Sleep;
}

export const moodFaces: { value: Mood; face: string; label: string }[] = [
  { value: 5, face: "😄", label: "מצוין" },
  { value: 4, face: "🙂", label: "טוב" },
  { value: 3, face: "😐", label: "ככה ככה" },
  { value: 2, face: "🙁", label: "לא טוב" },
  { value: 1, face: "😢", label: "רע מאוד" },
];
export const painOptions: { value: PainLevel; label: string }[] = [
  { value: "none", label: "בלי כאב" },
  { value: "mild", label: "כאב קל" },
  { value: "moderate", label: "כאב בינוני" },
  { value: "severe", label: "כאב חזק" },
];
export const sleepOptions: { value: Sleep; label: string; icon: string }[] = [
  { value: "good", label: "ישנתי טוב", icon: "😴" },
  { value: "so-so", label: "ככה ככה", icon: "🥱" },
  { value: "bad", label: "ישנתי רע", icon: "😩" },
];

export interface CheckInResult {
  reply: string;
  alert: DemoAlert | null;
}

/**
 * Turns a check-in into a warm reply and, when needed, an alert for the team.
 * Rules are deterministic and conservative: the patient is never told it is "fine" to ignore pain.
 */
export function evaluateCheckIn(p: PatientProfile, c: CheckIn): CheckInResult {
  let alert: DemoAlert | null = null;
  const parts: string[] = [];
  if (c.pain === "severe") {
    alert = buildAlert(p, "distress", "high", "אח/ות", `צ'ק-אין: כאב חזק`, "דיווח על כאב חזק בצ'ק-אין היומי", c.at);
    parts.push("כאב חזק זה משהו שהאחות צריכה לדעת. שלחתי לה הודעה – היא תגיע אליך.");
  } else if (c.pain === "moderate") {
    parts.push("שמעתי שיש כאב. אם הוא מתחזק – לחצו על 'קריאה לאחות'.");
  }
  if (c.mood === 1) {
    alert ??= buildAlert(p, "distress", "medium", "פסיכולוג/ית", "צ'ק-אין: מצב רוח רע מאוד", "דיווח על מצב רוח רע מאוד בצ'ק-אין היומי", c.at);
    parts.push("אני מצטער שקשה לך היום. ביקשתי שמישהו מהצוות יבוא לשבת איתך. רוצה לדבר איתי בינתיים?");
  } else if (c.mood === 2) {
    parts.push("יש ימים קשים יותר. אני כאן אם בא לך לדבר.");
  } else if (c.mood >= 4) {
    parts.push("איזה כיף לשמוע!");
  }
  if (c.sleep === "bad") parts.push("לילה קשה מעייף. אפשר לבקש מהאחות שמיכה נוספת או לנוח בצהריים.");
  if (parts.length === 0) parts.push("תודה ששיתפת. אני איתך לאורך היום.");
  return { reply: parts.join(" "), alert };
}

// ---------- Help requests ----------

export type HelpKind = "nurse" | "toilet" | "pain" | "water" | "position" | "talk";
export const helpOptions: { kind: HelpKind; label: string; icon: string }[] = [
  { kind: "nurse", label: "קריאה לאחות", icon: "🔔" },
  { kind: "toilet", label: "עזרה לשירותים", icon: "🚻" },
  { kind: "pain", label: "יש לי כאב", icon: "🤕" },
  { kind: "water", label: "מים / שתייה", icon: "💧" },
  { kind: "position", label: "לשנות תנוחה", icon: "🛏️" },
  { kind: "talk", label: "לדבר עם מישהו מהצוות", icon: "💬" },
];

const helpMeta: Record<HelpKind, { priority: AlertPriority; role: ClinicianRole; why: string; reply: string }> = {
  nurse: { priority: "high", role: "אח/ות", why: "המטופל ביקש אחות מהמסך", reply: "שלחתי קריאה לאחות. בינתיים הישארו במקום – אל תקומו לבד." },
  toilet: { priority: "high", role: "אח/ות", why: "בקשת עזרה ללכת לשירותים (סיכון נפילה)", reply: "קראתי לצוות שיעזור לכם. בבקשה חכו להם ואל תקומו לבד." },
  pain: { priority: "high", role: "אח/ות", why: "בקשת עזרה בגלל כאב", reply: "שלחתי לאחות שיש לכם כאב. היא תבוא לבדוק." },
  water: { priority: "low", role: "אח/ות", why: "בקשה לשתייה", reply: "ביקשתי שיביאו לכם לשתות." },
  position: { priority: "medium", role: "אח/ות", why: "בקשה לעזרה בשינוי תנוחה", reply: "ביקשתי שיבואו לעזור לכם להתמקם בנוח." },
  talk: { priority: "low", role: "עובד/ת סוציאלי/ת", why: "המטופל ביקש לשוחח עם איש צוות", reply: "העברתי את הבקשה. מישהו מהצוות יבוא לדבר איתכם." },
};

export function helpRequest(p: PatientProfile, kind: HelpKind, at = new Date().toISOString()): { reply: string; alert: DemoAlert } {
  const m = helpMeta[kind];
  const label = helpOptions.find((h) => h.kind === kind)?.label ?? kind;
  return { reply: m.reply, alert: buildAlert(p, "help_request", m.priority, m.role, `בקשה מהמסך: ${label}`, m.why, at) };
}

// ---------- Shared ----------

export const uid = () => Math.random().toString(36).slice(2, 10);

function buildAlert(p: PatientProfile, category: SafetyCategory, priority: AlertPriority, role: ClinicianRole, quote: string, why: string, at: string): DemoAlert {
  return {
    id: `bed-${uid()}`, patientId: p.id, priority, category, createdAt: at, quote, why,
    uncertainty: "בקשה ישירה מהמטופל דרך מסך המיטה – נדרשת הגעה ובדיקה אנושית.",
    clinicianContext: p.approvedNotes.join(" · "), targetRole: role, status: "open",
  };
}

/** Patient-friendly progress: only clinician-approved items, never raw scores. */
export function progressSummary(p: PatientProfile): { trend: "up" | "flat" | "start"; text: string } {
  const w = p.weekly;
  if (w.length < 2) return { trend: "start", text: "התחלנו את הדרך. כל יום של תרגול נחשב." };
  const first = w[0]!.fim, last = w[w.length - 1]!.fim;
  if (last > first) return { trend: "up", text: "הצוות רואה שיפור מאז שהגעת. כל הכבוד על ההשקעה!" };
  return { trend: "flat", text: "ההתקדמות בשיקום לא תמיד ישרה. הצוות איתך בכל צעד." };
}
