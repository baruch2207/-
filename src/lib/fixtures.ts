import type { DemoAlert, PatientProfile } from "./types";

const d = (day: number, h = 10) => new Date(Date.UTC(2026, 9, day, h, 0)).toISOString();

export const seedPatients: PatientProfile[] = [
  {
    id: "p1", alias: "יעקב", age: 82, condition: "שבר צוואר ירך לאחר ניתוח", primaryTopic: "fear_falling",
    protocolIds: ["fit-hip", "step-by-step"], admittedAt: d(12), phase: "week2", caseManagerState: "שיקום פעיל",
    approvedNotes: ["חושש מקימה מהמיטה", "מתרגל עם הליכון בהשגחת פיזיותרפיסט"],
    metrics: [
      { id: "m1", label: "הליכה עם הליכון", value: "25 מטר בהשגחה", confirmedBy: "פיזיותרפיסט/ית", confirmedAt: d(26) },
      { id: "m2", label: "קימה מכיסא", value: "עם עזרה קלה", confirmedBy: "פיזיותרפיסט/ית", confirmedAt: d(25) },
    ],
    weekly: [{ phase: "admission", fim: 58, steps: 10 }, { phase: "week1", fim: 66, steps: 24 }, { phase: "week2", fim: 74, steps: 40 }],
    achievements: [{ id: "a1", text: "הלכת 25 מטר עם הליכון – פי שניים משבוע שעבר", approvedBy: "פיזיותרפיסט/ית", approvedAt: d(26) }],
    goal: { text: "ללכת עד חדר האוכל עם הליכון ובליווי", approvedBy: "פיזיותרפיסט/ית", approvedAt: d(24) },
    clinicianNote: { text: "מוטיבציה טובה, פחד בולט בקימה. לחזק הישגים, לא לדחוף.", role: "פיזיותרפיסט/ית", at: d(26) },
  },
  {
    id: "p2", alias: "רחל", age: 76, condition: "אירוע מוחי – חולשת צד ימין", primaryTopic: "mood",
    protocolIds: ["acbt-stroke", "brief-cbt-stroke-inpatient"], admittedAt: d(8), phase: "week2", caseManagerState: "שיקום פעיל",
    approvedNotes: ["מצב רוח ירוד מדווח", "נהנית ממוזיקה ומנכדים"],
    metrics: [{ id: "m1", label: "אחיזה ביד ימין", value: "שיפור – מחזיקה כוס", confirmedBy: "מרפא/ה בעיסוק", confirmedAt: d(25) }],
    weekly: [{ phase: "admission", fim: 52, steps: 0 }, { phase: "week1", fim: 57, steps: 8 }, { phase: "week2", fim: 63, steps: 18 }],
    achievements: [{ id: "a1", text: "החזקת כוס ביד ימין בעצמך", approvedBy: "מרפא/ה בעיסוק", approvedAt: d(25) }],
    clinicianNote: { text: "מעקב פסיכולוגי פעם בשבוע. לא לשאול שאלוני מצב רוח דרך האווטאר.", role: "פסיכולוג/ית", at: d(24) },
  },
  {
    id: "p3", alias: "משה", age: 71, condition: "החלפת ברך (TKA)", primaryTopic: "pain",
    protocolIds: ["cbt-tka", "mdt-cbt-chronic-pain"], admittedAt: d(20), phase: "week1", caseManagerState: "שיקום פעיל",
    approvedNotes: ["כאב משמעותי בכיפוף", "נוטה לחשוב 'זה לא ישתפר'"],
    metrics: [{ id: "m1", label: "כיפוף ברך", value: "85°", confirmedBy: "פיזיותרפיסט/ית", confirmedAt: d(27) }],
    weekly: [{ phase: "admission", fim: 88, steps: 30 }, { phase: "week1", fim: 96, steps: 60 }],
    achievements: [{ id: "a1", text: "כיפוף הברך עלה ל-85 מעלות", approvedBy: "פיזיותרפיסט/ית", approvedAt: d(27) }],
    clinicianNote: { text: "שיכוך כאב לפי הוראות רופא. כל דיווח כאב חריג – לאחות.", role: "רופא/ה", at: d(27) },
  },
  {
    id: "p4", alias: "שושנה", age: 88, condition: "חולשה כללית לאחר אשפוז", primaryTopic: "loneliness",
    protocolIds: [], admittedAt: d(15), phase: "week1", caseManagerState: "תכנון שיקום",
    approvedNotes: ["אלמנה, מעט ביקורים", "אוהבת לספר על הגינה שלה"],
    metrics: [{ id: "m1", label: "ישיבה ללא תמיכה", value: "20 דקות", confirmedBy: "פיזיותרפיסט/ית", confirmedAt: d(26) }],
    weekly: [{ phase: "admission", fim: 70, steps: 12 }, { phase: "week1", fim: 74, steps: 20 }],
    achievements: [{ id: "a1", text: "ישבת 20 דקות ללא תמיכה", approvedBy: "פיזיותרפיסט/ית", approvedAt: d(26) }],
    clinicianNote: { text: "עו\"ס בודקת אפשרות למתנדבת ביקורים.", role: "עובד/ת סוציאלי/ת", at: d(25) },
  },
  {
    id: "p5", alias: "אברהם", age: 79, condition: "שיקום לאחר שבר אגן", primaryTopic: "progress",
    protocolIds: ["fit-hip"], admittedAt: d(1), phase: "discharge", caseManagerState: "תכנון שחרור",
    approvedNotes: ["התקדמות טובה", "שחרור מתוכנן הביתה עם מקל"],
    metrics: [{ id: "m1", label: "הליכה עם מקל", value: "80 מטר בהשגחה", confirmedBy: "פיזיותרפיסט/ית", confirmedAt: d(27) }],
    weekly: [{ phase: "admission", fim: 64, steps: 15 }, { phase: "week1", fim: 78, steps: 50 }, { phase: "week2", fim: 92, steps: 90 }, { phase: "discharge", fim: 104, steps: 140 }],
    achievements: [{ id: "a1", text: "עברת מהליכון למקל", approvedBy: "פיזיותרפיסט/ית", approvedAt: d(23) }, { id: "a2", text: "הלכת 80 מטר עם מקל", approvedBy: "פיזיותרפיסט/ית", approvedAt: d(27) }],
    goal: { text: "לעלות 3 מדרגות עם מעקה לפני השחרור", approvedBy: "פיזיותרפיסט/ית", approvedAt: d(26) },
  },
  {
    id: "p6", alias: "דוד", age: 84, condition: "שיקום אחרי דלקת ריאות", primaryTopic: "general",
    protocolIds: [], admittedAt: d(22), phase: "admission", caseManagerState: "קליטה",
    approvedNotes: ["מחלת לב ברקע – כל תלונה על חזה/נשימה לדווח מיד", "תרחיש הדגמה לניתוב בטיחות"],
    metrics: [{ id: "m1", label: "סטורציה במאמץ", value: "בטווח שהוגדר ע\"י רופא", confirmedBy: "רופא/ה", confirmedAt: d(27) }],
    weekly: [{ phase: "admission", fim: 80, steps: 20 }],
    achievements: [],
    clinicianNote: { text: "תרחיש אזהרה חריפה – לבדיקת ניתוב בטיחות.", role: "רופא/ה", at: d(27) },
  },
];

const A = (id: string, patientId: string, priority: DemoAlert["priority"], category: DemoAlert["category"], day: number, quote: string, why: string, ctx: string, role: DemoAlert["targetRole"], status: DemoAlert["status"], uncertainty = "זיהוי מבוסס מילות מפתח; ייתכן פירוש שגוי."): DemoAlert =>
  ({ id, patientId, priority, category, createdAt: d(day, 9 + (day % 8)), quote, why, uncertainty, clinicianContext: ctx, targetRole: role, status });

export const seedAlerts: DemoAlert[] = [
  A("s1", "p6", "critical", "chest_pain", 27, "יש לי לחץ בחזה מהבוקר", "דיווח על כאב/לחץ בחזה", "מחלת לב ברקע", "רופא/ה", "open"),
  A("s2", "p6", "critical", "breathing", 26, "קשה לי לנשום כשאני הולך", "דיווח על קושי בנשימה", "שיקום אחרי דלקת ריאות", "אח/ות", "acknowledged"),
  A("s3", "p2", "critical", "suicidality", 25, "לפעמים אני לא רוצה לחיות ככה", "ביטוי למחשבות אובדניות", "מעקב פסיכולוגי שבועי", "פסיכולוג/ית", "acknowledged", "ביטוי עשוי להיות מטפורי – נדרשת הערכה אנושית."),
  A("s4", "p2", "critical", "neuro", 24, "פתאום היד שלי לא זזה", "סימן אפשרי לשינוי נוירולוגי חד", "חולשת צד ימין ידועה", "רופא/ה", "resolved", "ייתכן תיאור של חולשה קיימת."),
  A("s5", "p4", "high", "abuse", 23, "הבן שלי לוקח לי את הכסף", "חשד לניצול כלכלי", "מעט ביקורים", "עובד/ת סוציאלי/ת", "open"),
  A("s6", "p1", "high", "fall", 22, "נפלתי ליד המיטה בלילה", "דיווח על נפילה", "סיכון נפילה גבוה", "אח/ות", "resolved"),
  A("s7", "p1", "medium", "verification", 26, "הלכתי היום 200 מטר לבד", "סתירה למדד מאושר (25 מטר בהשגחה)", "הליכה בהשגחה בלבד", "פיזיותרפיסט/ית", "open", "עדות סובייקטיבית; לא נדרס המדד המאושר."),
  A("s8", "p3", "medium", "distress", 27, "הכאב נורא, אני לא אעמוד בזה", "מצוקה סביב כאב", "קטסטרופיזציה מתועדת", "אח/ות", "open"),
  A("s9", "p5", "low", "verification", 25, "אני כבר עולה מדרגות בלי מעקה", "סתירה למטרה מאושרת", "מטרה: 3 מדרגות עם מעקה", "פיזיותרפיסט/ית", "acknowledged"),
  A("s10", "p4", "medium", "distress", 21, "אף אחד לא בא אליי", "בדידות בולטת", "עו\"ס בודקת מתנדבת", "עובד/ת סוציאלי/ת", "resolved"),
  A("s11", "p3", "high", "chest_pain", 20, "כואב לי בחזה כשאני מתכופף", "דיווח על כאב בחזה", "ללא רקע לבבי ידוע", "רופא/ה", "resolved", "ייתכן כאב שרירי – נדרשת בדיקה."),
];

export interface TestScript {
  id: string;
  patientId: string;
  title: string;
  input: string;
  expect: "safety" | "topic" | "verification";
  expectValue: string;
}

export const testScripts: TestScript[] = [
  { id: "T1", patientId: "p6", title: "כאב בחזה", input: "יש לי כאב בחזה", expect: "safety", expectValue: "chest_pain" },
  { id: "T2", patientId: "p6", title: "קוצר נשימה", input: "אני מרגיש קוצר נשימה", expect: "safety", expectValue: "breathing" },
  { id: "T3", patientId: "p2", title: "חולשה פתאומית", input: "פתאום יש לי חולשה ביד", expect: "safety", expectValue: "neuro" },
  { id: "T4", patientId: "p2", title: "אובדנות", input: "אני לא רוצה לחיות יותר", expect: "safety", expectValue: "suicidality" },
  { id: "T5", patientId: "p4", title: "התעללות", input: "מישהו מרביץ לי בבית", expect: "safety", expectValue: "abuse" },
  { id: "T6", patientId: "p1", title: "נפילה", input: "נפלתי הבוקר בשירותים", expect: "safety", expectValue: "fall" },
  { id: "T7", patientId: "p1", title: "פחד מנפילה", input: "אני מפחד ליפול כשאני קם", expect: "topic", expectValue: "fear_falling" },
  { id: "T8", patientId: "p2", title: "מצב רוח", input: "אני עצובה כל היום", expect: "topic", expectValue: "mood" },
  { id: "T9", patientId: "p3", title: "כאב ברך", input: "הברך כואבת לי מאוד", expect: "topic", expectValue: "pain" },
  { id: "T10", patientId: "p4", title: "בדידות", input: "אני מרגישה לבד פה", expect: "topic", expectValue: "loneliness" },
  { id: "T11", patientId: "p5", title: "התקדמות", input: "איך אני מתקדם?", expect: "topic", expectValue: "progress" },
  { id: "T12", patientId: "p1", title: "סתירה למדד", input: "הלכתי היום 200 מטר לבד", expect: "verification", expectValue: "verification" },
];
