import type { AlertPriority, ClinicianRole, SafetyCategory } from "./types";

export interface SafetyPolicy {
  id: string;
  category: SafetyCategory;
  priority: AlertPriority;
  patterns: RegExp[];
  why: string;
  targetRole: ClinicianRole;
  response: string;
}

// Deterministic, high-priority. Evaluated BEFORE any conversational rule.
export const safetyPolicies: SafetyPolicy[] = [
  { id: "SP-CHEST", category: "chest_pain", priority: "critical", targetRole: "רופא/ה",
    patterns: [/כאב(ים)?\s*(ב|של\s*ה)?חזה/, /לחץ\s*(ב|על\s*ה)?חזה/, /כואב\s*לי\s*(ב|ה)?חזה/],
    why: "דיווח על כאב/לחץ בחזה", response: "זה חשוב. בבקשה לחצ/י עכשיו על לחצן הקריאה או קרא/י לאחות מיד. אני לא יכול לעזור בזה בעצמי." },
  { id: "SP-BREATH", category: "breathing", priority: "critical", targetRole: "אח/ות",
    patterns: [/קוצר\s*נשימה/, /(קשה|לא\s*מצליח(ה)?)\s*(לי\s*)?לנשום/, /חנק/, /אין\s*לי\s*אוויר/],
    why: "דיווח על קושי בנשימה", response: "קושי בנשימה צריך בדיקה מיידית. בבקשה קרא/י עכשיו לאחות או לחצ/י על לחצן הקריאה." },
  { id: "SP-NEURO", category: "neuro", priority: "critical", targetRole: "רופא/ה",
    patterns: [/פתאום.*(חולשה|בלבול|מבולבל|לא\s*מרגיש)/, /חולשה\s*פתאומית/, /(הפנים|היד|הרגל)\s*.*(נרדמ|לא\s*זז|צנח)/, /לא\s*מצליח(ה)?\s*לדבר/, /מבולבל(ת)?\s*פתאום/],
    why: "סימן אפשרי לשינוי נוירולוגי חד", response: "שינוי פתאומי כזה צריך בדיקה מיד. בבקשה קרא/י לצוות עכשיו, אל תקום/י לבד." },
  { id: "SP-SUICIDE", category: "suicidality", priority: "critical", targetRole: "פסיכולוג/ית",
    patterns: [/(רוצה|בא\s*לי)\s*למות/, /להתאבד/, /לשים\s*קץ/, /לא\s*רוצה\s*לחיות/, /עדיף\s*שלא\s*אהיה/, /לפגוע\s*בעצמי/],
    why: "ביטוי למחשבות אובדניות/פגיעה עצמית", response: "תודה שסיפרת לי. זה חשוב מאוד, ואת/ה לא לבד. אני מבקש שתקרא/י עכשיו לאחות או לאיש צוות, כדי שמישהו יהיה איתך. בישראל אפשר גם לפנות לער\"ן בטלפון 1201." },
  { id: "SP-ABUSE", category: "abuse", priority: "high", targetRole: "עובד/ת סוציאלי/ת",
    patterns: [/מרביץ|הרביץ|מכה\s*אותי|היכה/, /מתעלל|התעלל|פוגע\s*בי/, /לוקח(ים)?\s*לי\s*(את\s*ה)?כסף/, /מאיים\s*עלי/],
    why: "חשד לפגיעה או התעללות", response: "מה שסיפרת חשוב ויש מי שיכול לעזור. בבקשה ספר/י לאחות או לעובדת הסוציאלית עוד היום. מגיע לך להיות בטוח/ה." },
  { id: "SP-FALL", category: "fall", priority: "high", targetRole: "אח/ות",
    patterns: [/נפלתי/, /החלקתי/, /קמתי\s*לבד\s*ו/],
    why: "דיווח על נפילה שאירעה", response: "תודה שסיפרת. חשוב שהצוות יבדוק אותך אחרי נפילה. בבקשה קרא/י לאחות עכשיו." },
];

export function checkSafety(text: string): SafetyPolicy | null {
  const t = text.replace(/[״"']/g, "");
  return safetyPolicies.find((p) => p.patterns.some((r) => r.test(t))) ?? null;
}
