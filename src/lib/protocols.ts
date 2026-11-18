import type { Topic } from "./types";

export type EvidenceStatus =
  | "פרוטוקול מחקר"
  | "ניסוי מבוקר אקראי"
  | "מחקר יישום"
  | "מחקר תצפיתי"
  | "כלי מדידה"
  | "סקירה / מטה-אנליזה";

export interface Citation {
  title: string;
  url: string;
  evidence: EvidenceStatus;
  note: string;
}

export interface SupportProtocol {
  id: string;
  version: string;
  name: string;
  domain: Topic;
  boundaryTags: string[];
  triggers: string[];
  techniques: string[];
  questions: string[];
  doNot: string[];
  citations: Citation[];
}

export const PROTOCOL_REGISTRY_VERSION = "2026.10-demo.1";

export const protocolRegistry: SupportProtocol[] = [
  {
    id: "fit-hip",
    version: "1.0-demo",
    name: "FIT-HIP – התמודדות עם פחד מנפילה",
    domain: "fear_falling",
    boundaryTags: ["תמיכה שיחתית בלבד", "ללא שינוי תרגול", "פיזיותרפיסט נוכח בתרגול"],
    triggers: ["פחד", "נפילה", "ליפול", "מפחד", "חושש", "לא בטוח ללכת"],
    techniques: ["נרמול הפחד", "חיבור לשיפור שאושר בידי הצוות", "חשיבה מאוזנת", "עידוד שיחה עם הפיזיותרפיסט"],
    questions: ["מתי הפחד מורגש יותר – בקימה, בהליכה או בלילה?", "מה עזר לך להרגיש בטוח יותר בתרגול האחרון?"],
    doNot: ["לא להציע תרגילים חדשים", "לא לעודד הליכה ללא השגחה", "לא לבטל פחד כ'לא הגיוני'"],
    citations: [{ title: "FIT-HIP: motivational intervention for fear of falling after hip fracture", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5359926/", evidence: "פרוטוקול מחקר", note: "פרוטוקול ניסוי; אין כאן טענת יעילות לאפליקציה." }],
  },
  {
    id: "step-by-step",
    version: "1.0-demo",
    name: "Step by Step – שבר ירך באשפוז (תוכן חשיפה בהובלת קלינאי בלבד)",
    domain: "fear_falling",
    boundaryTags: ["חשיפה מדורגת – רק בהובלת קלינאי", "האווטאר אינו מבצע חשיפה", "שיחה תומכת בלבד"],
    triggers: ["ירך", "שבר", "קימה מהמיטה"],
    techniques: ["חיזוק מוטיבציה", "שיקוף התקדמות מאושרת", "הפניה לצוות לתכנון חשיפה"],
    questions: ["על מה היית רוצה לדבר עם הפיזיותרפיסט במפגש הבא?"],
    doNot: ["לא לתכנן או לבצע תרגילי חשיפה", "לא לקבוע מטרות תנועה", "לא לשנות רמת השגחה"],
    citations: [{ title: "Step by Step: CBT-based fear of falling program after hip fracture", url: "https://pubmed.ncbi.nlm.nih.gov/28415881/", evidence: "ניסוי מבוקר אקראי", note: "התערבות בהובלת קלינאים; כאן משמש רק כהשראה לשיח תומך." }],
  },
  {
    id: "acbt-stroke",
    version: "1.0-demo",
    name: "Augmented CBT לאחר שבץ",
    domain: "mood",
    boundaryTags: ["ללא אבחון", "ניטור מצב רוח באחריות הצוות", "שיחה תומכת"],
    triggers: ["עצוב", "אין טעם", "מדוכא", "בוכה", "לא רוצה כלום"],
    techniques: ["הפעלה התנהגותית עדינה", "זיהוי רגעים טובים", "שיקוף רגשי"],
    questions: ["היה היום רגע אחד, אפילו קטן, שהרגיש קצת יותר טוב?"],
    doNot: ["לא לאבחן דיכאון", "לא לתת ציון ממצב רוח בשיחה", "לא להבטיח החלמה"],
    citations: [{ title: "Augmented CBT for post-stroke depression (study protocol / trial literature)", url: "https://pubmed.ncbi.nlm.nih.gov/?term=augmented+cognitive+behavioural+therapy+post-stroke+depression", evidence: "פרוטוקול מחקר", note: "קישור לחיפוש ספרות; יש לאמת מקור ספציפי לפני שימוש מחקרי." }],
  },
  {
    id: "brief-cbt-stroke-inpatient",
    version: "1.0-demo",
    name: "Brief CBT למצוקה רגשית באשפוז שיקומי אחרי שבץ",
    domain: "mood",
    boundaryTags: ["קצר ותומך", "הפניה לפסיכולוג/ית", "ללא אבחון"],
    triggers: ["מתוסכל", "כועס", "לחוץ", "מודאג"],
    techniques: ["נרמול", "פתרון בעיות קטן", "חיבור לגורם צוות"],
    questions: ["מה הכי מעסיק אותך עכשיו?"],
    doNot: ["לא להחליף טיפול פסיכולוגי", "לא לפרש תסמינים"],
    citations: [{ title: "Brief CBT for emotional distress in inpatient stroke rehabilitation", url: "https://pubmed.ncbi.nlm.nih.gov/?term=brief+cognitive+behavioural+therapy+inpatient+stroke+rehabilitation+distress", evidence: "מחקר יישום", note: "קישור לחיפוש ספרות; סטטוס ראיות לאימות." }],
  },
  {
    id: "cbt-tka",
    version: "1.0-demo",
    name: "CBT סביב קטסטרופיזציה של כאב אחרי החלפת ברך (TKA)",
    domain: "pain",
    boundaryTags: ["ללא ייעוץ תרופתי", "דיווח כאב לצוות", "ללא שינוי תרגול"],
    triggers: ["כאב", "כואב", "ברך", "לא אעמוד בזה", "נורא"],
    techniques: ["אימות החוויה", "הפרדה בין כאב לנזק – רק כפי שהסביר הצוות", "עידוד דיווח לאחות"],
    questions: ["מה עוזר לך קצת כשהכאב עולה?"],
    doNot: ["לא להמליץ על תרופות", "לא לומר 'זה לא כואב באמת'", "לא לעודד להתאמץ דרך כאב"],
    citations: [{ title: "Pain coping skills / CBT for pain catastrophizing around total knee arthroplasty", url: "https://pubmed.ncbi.nlm.nih.gov/?term=pain+catastrophizing+cognitive+behavioral+total+knee+arthroplasty", evidence: "ניסוי מבוקר אקראי", note: "תוצאות מעורבות בספרות; אין טענת יעילות כאן." }],
  },
  {
    id: "mdt-cbt-chronic-pain",
    version: "1.0-demo",
    name: "CBT רב-מקצועי לכאב כרוני",
    domain: "pain",
    boundaryTags: ["בהובלת צוות רב-מקצועי", "שיחה תומכת בלבד"],
    triggers: ["כאב כרוני", "כואב כל הזמן", "שנים"],
    techniques: ["קצב פעילות כפי שתוכנן ע\"י הצוות", "הכרה בהצלחות קטנות"],
    questions: ["איך הכאב משפיע על היום שלך כאן?"],
    doNot: ["לא לבנות תוכנית פעילות", "לא לשנות תרופות"],
    citations: [{ title: "Multidisciplinary biopsychosocial rehabilitation for chronic pain (Cochrane)", url: "https://pubmed.ncbi.nlm.nih.gov/25180773/", evidence: "סקירה / מטה-אנליזה", note: "סקירה; ההקשר באפליקציה הוא תמיכה בלבד." }],
  },
];

export interface InstrumentProtocol {
  id: string;
  name: string;
  construct: string;
  rater: "מטופל" | "צוות";
  licenseNote: string;
  url: string;
  demoItems: string[]; // explicitly simulated, NOT the validated wording
  demoScale: string[];
}

export const RESEARCH_MARKER = "מדידה מחקרית מחייבת נוסח מתורגם ומתוקף רשמי ורישיון. הפריטים כאן מדומים ואינם הכלי המקורי.";

export const instrumentRegistry: InstrumentProtocol[] = [
  { id: "phq2", name: "PHQ-2", construct: "מצב רוח (סינון)", rater: "מטופל", licenseNote: "נוסח עברי רשמי נדרש", url: "https://www.phqscreeners.com/", demoItems: ["[פריט מדומה] כמה נהנית מדברים השבוע?", "[פריט מדומה] כמה הרגשת מדוכדך/ת?"], demoScale: ["כלל לא", "קצת", "די הרבה", "מאוד"] },
  { id: "gad2", name: "GAD-2", construct: "חרדה (סינון)", rater: "מטופל", licenseNote: "נוסח עברי רשמי נדרש", url: "https://www.phqscreeners.com/", demoItems: ["[פריט מדומה] כמה הרגשת מתוח/ה?", "[פריט מדומה] כמה קשה היה להפסיק לדאוג?"], demoScale: ["כלל לא", "קצת", "די הרבה", "מאוד"] },
  { id: "who5", name: "WHO-5", construct: "רווחה נפשית", rater: "מטופל", licenseNote: "יש להשתמש בתרגום הרשמי", url: "https://www.psykiatri-regionh.dk/who-5/", demoItems: ["[פריט מדומה] הרגשתי רגוע/ה", "[פריט מדומה] התעוררתי רענן/ה", "[פריט מדומה] היה לי עניין ביום"], demoScale: ["אף פעם", "לפעמים", "לעיתים קרובות", "תמיד"] },
  { id: "sfesi", name: "Short FES-I", construct: "דאגה מנפילה", rater: "מטופל", licenseNote: "נוסח מתוקף נדרש (ProFaNE)", url: "https://www.profane.eu.org/", demoItems: ["[פריט מדומה] דאגה בקימה מכיסא", "[פריט מדומה] דאגה בהליכה במסדרון"], demoScale: ["לא דואג/ת", "קצת", "די", "מאוד"] },
  { id: "ucla3", name: "UCLA-3", construct: "בדידות", rater: "מטופל", licenseNote: "נוסח מתוקף נדרש", url: "https://pubmed.ncbi.nlm.nih.gov/18504505/", demoItems: ["[פריט מדומה] הרגשתי שחסרה לי חברה", "[פריט מדומה] הרגשתי מבודד/ת"], demoScale: ["כמעט אף פעם", "לפעמים", "לעיתים קרובות"] },
  { id: "prps", name: "PRPS", construct: "השתתפות בשיקום – מדורג ע\"י צוות", rater: "צוות", licenseNote: "מדורג ע\"י צוות בלבד; המטופל אינו ממלא", url: "https://www.sralab.org/rehabilitation-measures/pittsburgh-rehabilitation-participation-scale", demoItems: ["[דירוג מדומה] השתתפות בטיפול היום"], demoScale: ["1", "2", "3", "4", "5", "6"] },
];

export const references: Citation[] = [
  { title: "SCI-High Project", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6783797/", evidence: "מחקר יישום", note: "פיתוח מדדי איכות לשיקום עמוד שדרה." },
  { title: "SCIRehab Project", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2718825/", evidence: "מחקר תצפיתי", note: "תיעוד תהליכי שיקום; לא ניסוי התערבות." },
  { title: "RehaCAT+", url: "https://bmjopen.bmj.com/content/12/6/e061259", evidence: "פרוטוקול מחקר", note: "פרוטוקול; תוצאות יעילות אינן מוצגות כאן." },
  { title: "Pittsburgh Rehabilitation Participation Scale (PRPS)", url: "https://www.sralab.org/rehabilitation-measures/pittsburgh-rehabilitation-participation-scale", evidence: "כלי מדידה", note: "דירוג צוות." },
  { title: "FIT-HIP", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5359926/", evidence: "פרוטוקול מחקר", note: "פחד מנפילה אחרי שבר ירך." },
  { title: "Step by Step", url: "https://pubmed.ncbi.nlm.nih.gov/28415881/", evidence: "ניסוי מבוקר אקראי", note: "תוכנית בהובלת קלינאים." },
];

export const protocolById = (id?: string) => protocolRegistry.find((p) => p.id === id);
