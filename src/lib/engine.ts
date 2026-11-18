import { checkSafety } from "./safety";
import { protocolRegistry } from "./protocols";
import { QUIZ_TRIGGER, answerQuiz, currentItem, isDone, qualitativeInsight, quizDisclaimer, quizForTopic } from "./questionnaire";
import type { ChatMessage, DemoAlert, MemoryFact, PatientMemory, PatientProfile, Rationale, Topic } from "./types";

export const emptyMemory = (): PatientMemory => ({ messages: [], slot: null, quiz: null, facts: [], recentVariants: [], verifications: [] });

const topicKeywords: Record<Exclude<Topic, "general">, RegExp> = {
  fear_falling: /פחד|מפחד|חושש|ליפול|נפילה|לא\s*בטוח|יציב/,
  mood: /עצוב|מדוכא|בוכה|אין\s*טעם|מצב\s*רוח|מתוסכל|לא\s*רוצה\s*כלום|קשה\s*לי\s*נפשית|מודאג/,
  pain: /כאב|כואב|ברך|דוקר|שורף/,
  loneliness: /לבד|בודד|משעמם|אף\s*אחד|מתגעגע|ביקור/,
  progress: /מתקדם|התקדמות|הישג|השתפרתי|איך\s*אני|מה\s*השגתי/,
};

const exerciseChange = /(תרגיל|תרגול)\s*(חדש|נוסף)|לתרגל\s*לבד|ללכת\s*לבד|בלי\s*הליכון|להוריד\s*(את\s*)?ה?הליכון|להפסיק\s*(את\s*)?ה?(טיפול|תרגול)|כמה\s*חזרות/;
const yes = /^(כן|בטח|נכון|קצת|אולי|היה|עזר|טוב|יותר\s*טוב|בסדר)/;
const no = /^(לא|ממש\s*לא|אין|כלום|גרוע|נורא|קשה)/;

export function detectTopic(text: string, profile: PatientProfile): Topic {
  for (const [t, r] of Object.entries(topicKeywords)) if (r.test(text)) return t as Topic;
  return profile.primaryTopic;
}

function pick(variants: string[], recent: string[]): string {
  return variants.find((v) => !recent.includes(v)) ?? variants[Math.floor(Date.now() / 1000) % variants.length] ?? variants[0] ?? "";
}

interface Step { say: string[]; quick?: string[]; technique: string }
type Flow = Step[];

function flows(p: PatientProfile): Record<Topic, { start: Flow; positive: Step; negative: Step }> {
  const ach = p.achievements[0]?.text;
  const goal = p.goal?.text;
  return {
    fear_falling: {
      start: [{ technique: "נרמול + שאלה פתוחה", say: [
        `${p.alias}, הרבה אנשים מרגישים פחד אחרי מה שעברת. זה טבעי. מתי הפחד מורגש יותר – בקימה או בהליכה?`,
        `אני שומע שהפחד נוכח. זה הגיוני לגמרי. באיזה רגע ביום הוא הכי חזק?`] , quick: ["בקימה", "בהליכה", "בלילה"] }],
      positive: { technique: "חיבור להישג מאושר", say: [
        ach ? `ובכל זאת, הצוות רשם: ${ach}. זה קרה כשהפיזיותרפיסט היה לידך. מה עזר לך באותו רגע?` : `תודה ששיתפת. מה עזר לך להרגיש קצת יותר בטוח בתרגול האחרון?`,
        `כדאי לספר את זה לפיזיותרפיסט – הוא יכול להתאים את הליווי. מה היית רוצה להגיד לו?`], quick: ["שהוא היה לידי", "ההליכון", "לא יודע"] },
      negative: { technique: "אימות + הפניה לצוות", say: [
        `זה בסדר שעוד לא קל. אני לא אבקש ממך לעשות שום דבר לבד – התרגול תמיד עם הפיזיותרפיסט. תרצה שנחשוב יחד מה לשאול אותו?`,
        `אני איתך. הפחד לא אומר שאתה לא מתקדם. על מה הכי חשוב לך לדבר עם הצוות?`], quick: ["כן", "לא עכשיו"] },
    },
    mood: {
      start: [{ technique: "שיקוף רגשי", say: [
        `נשמע שזה תקופה כבדה, ${p.alias}. אני כאן להקשיב. היה היום רגע אחד, אפילו קטן, שהרגיש קצת יותר טוב?`,
        `תודה שאת/ה משתף/ת אותי. לפעמים בשיקום הימים מרגישים ארוכים. מה הכי מעסיק אותך עכשיו?`], quick: ["כן, היה רגע", "לא ממש"] }],
      positive: { technique: "הפעלה התנהגותית עדינה", say: [
        `זה רגע ששווה לזכור. ${ach ? `גם הצוות שם לב: ${ach}. ` : ""}מה היה בו שעזר?`,
        `יפה שמצאת אותו. מה עוד אולי יכול להביא עוד רגע כזה היום – שיחה, מוזיקה, ביקור?`], quick: ["מוזיקה", "שיחה עם המשפחה", "לא יודע/ת"] },
      negative: { technique: "אימות + חיבור לפסיכולוג/ית", say: [
        `זה בסדר שאין. אני לא כאן כדי לתקן, רק להיות איתך. הצוות כולל פסיכולוג/ית שאפשר לדבר איתו/ה. תרצה/י שאזכיר לאחות לתאם?`,
        `אני שומע כמה זה קשה. לא חייבים להרגיש טוב. האם יש מישהו בצוות שנוח לך לדבר איתו?`], quick: ["כן", "אולי מחר"] },
    },
    pain: {
      start: [{ technique: "אימות חוויית הכאב", say: [
        `כאב יכול להיות מתיש מאוד. כדאי לספר לאחות כמה זה כואב עכשיו – רק היא והרופא מחליטים על טיפול בכאב. מה עוזר לך קצת כשהכאב עולה?`,
        `אני מאמין לך שזה כואב. חשוב שהצוות ידע. האם כבר סיפרת לאחות היום?`], quick: ["מנוחה", "כבר סיפרתי", "שום דבר"] }],
      positive: { technique: "חיזוק התמודדות + הישג מאושר", say: [
        `טוב שמצאת משהו שעוזר. ${ach ? `ושווה לזכור: ${ach}. ` : ""}איך את/ה מרגיש/ה לקראת הטיפול הבא?`,
        `נשמע שאת/ה מכיר/ה את הגוף שלך היטב. על מה תרצה לדבר כדי להסיח קצת את הדעת?`], quick: ["בסדר", "מתוח"] },
      negative: { technique: "אימות + עידוד דיווח", say: [
        `כשנדמה ששום דבר לא עוזר, זה מתסכל מאוד. אני לא נותן עצות על תרופות, אבל האחות יכולה לבדוק. תרצה ללחוץ עכשיו על לחצן הקריאה?`,
        `הכאב אמיתי, ומגיע לך שיתייחסו אליו. אפשר לבקש מהאחות שיחה עם הרופא. זה נשמע לך?`], quick: ["כן", "אחר כך"] },
    },
    loneliness: {
      start: [{ technique: "שיחה חמה ויצירת קשר", say: [
        `טוב שאנחנו מדברים, ${p.alias}. ספר/י לי – על מה את/ה הכי אוהב/ת לדבר?`,
        `לפעמים במחלקה מרגישים רחוק מהבית. מי האנשים שהכי חסרים לך?`], quick: ["המשפחה", "הגינה", "חברים"] }],
      positive: { technique: "זיכרון חיובי", say: [
        `איזה יופי. מה הכי אהבת בזה?`,
        `נשמע שזה חלק חשוב ממך. תרצה/י שנבקש מהעובדת הסוציאלית לבדוק אפשרות לביקורים?`], quick: ["כן", "ספר/י עוד"] },
      negative: { technique: "אימות + חיבור לעו\"ס", say: [
        `אני שומע את הבדידות. העובדת הסוציאלית במחלקה יכולה לעזור עם ביקורים או מתנדבים. שאזכיר לצוות?`,
        `זה קשה להרגיש לבד. אני כאן עכשיו. תרצה/י שנדבר על משהו נעים?`], quick: ["כן", "לא כרגע"] },
    },
    progress: {
      start: [{ technique: "שיקוף הישגים מאושרים בלבד", say: [
        p.achievements.length
          ? `הצוות אישר לאחרונה: ${p.achievements.map((a) => a.text).join("; ")}. ${goal ? `המטרה שהוגדרה: ${goal}. ` : ""}איך את/ה מרגיש/ה עם זה?`
          : `עדיין אין לי עדכון התקדמות שאושר על ידי הצוות. כדאי לשאול את הפיזיותרפיסט במפגש הבא. מה הכי חשוב לך לדעת?`], quick: ["גאה", "עוד לא מספיק"] }],
      positive: { technique: "חיזוק", say: [`מגיע לך להרגיש גאה. ההישגים האלה הם שלך ושל הצוות יחד. מה הדבר הבא שאת/ה מצפה לו?`] , quick: ["לחזור הביתה", "ללכת יותר"] },
      negative: { technique: "אימות + הפניה", say: [`זה טבעי לרצות יותר. את קצב ההתקדמות קובע הצוות איתך. תרצה לרשום שאלה לפיזיותרפיסט?`], quick: ["כן", "לא"] },
    },
    general: {
      start: [{ technique: "פתיחה", say: [
        `שמח לדבר איתך, ${p.alias}. איך עובר עליך היום?`,
        `אני כאן. מה תרצה/י לספר לי?`], quick: ["בסדר", "קשה לי", "איך אני מתקדם?"] }],
      positive: { technique: "הקשבה", say: [`טוב לשמוע. מה הכי שימח אותך היום?`], quick: ["הביקור", "הטיפול"] },
      negative: { technique: "אימות", say: [`מצטער לשמוע. מה הכי קשה כרגע?`], quick: ["כאב", "פחד", "בדידות"] },
    },
  };
}

export interface EngineResult {
  reply: ChatMessage;
  memory: PatientMemory;
  alert?: DemoAlert | undefined;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function respond(profile: PatientProfile, memory: PatientMemory, text: string, now = new Date()): EngineResult {
  const at = now.toISOString();
  const patientMsg: ChatMessage = { id: uid(), from: "patient", text, at };
  const mem: PatientMemory = { ...memory, messages: [...memory.messages, patientMsg] };
  const finish = (say: string, rationale: Rationale, quick?: string[], safety = false, alert?: DemoAlert): EngineResult => {
    const reply: ChatMessage = { id: uid(), from: "bot", text: say, at, quickReplies: quick, safety, rationale };
    return { reply, alert, memory: { ...mem, messages: [...mem.messages, reply], recentVariants: [say, ...mem.recentVariants].slice(0, 8) } };
  };

  // 1. Safety – deterministic, highest priority
  const s = checkSafety(text);
  if (s) {
    const alert: DemoAlert = {
      id: uid(), patientId: profile.id, priority: s.priority, category: s.category, createdAt: at, quote: text,
      why: `${s.why} (מדיניות ${s.id})`, uncertainty: "זיהוי דטרמיניסטי לפי ביטויים; ייתכן חיובי שגוי. נדרשת הערכה אנושית.",
      clinicianContext: profile.approvedNotes.join(" · "), targetRole: s.targetRole, status: "open",
    };
    mem.slot = null;
    return finish(s.response, { topic: "general", rule: s.id, source: "safety-policy", technique: "ניתוב בטיחות" }, ["קראתי לצוות", "אני בסדר עכשיו"], true, alert);
  }

  // 2. Boundary: never change exercises/supervision
  if (exerciseChange.test(text)) {
    mem.slot = null;
    return finish(
      "זו שאלה חשובה, אבל רק הפיזיותרפיסט מחליט על תרגילים והשגחה. אני לא משנה את התוכנית. תרצה/י שנרשום את השאלה בשבילו?",
      { topic: "progress", rule: "BOUNDARY-EXERCISE", source: "local-rules", technique: "גבול תפקיד" }, ["כן", "לא"]);
  }

  // 3. Verification: patient claim conflicts with clinician metric
  const claim = text.match(/(\d+)\s*(מטר|צעדים)/);
  const walkMetric = profile.metrics.find((m) => /מטר/.test(m.value));
  const mNum = walkMetric ? Number(walkMetric.value.match(/(\d+)/)?.[1]) : NaN;
  if ((claim && walkMetric && Number(claim[1]) > mNum * 2) || (/לבד/.test(text) && walkMetric && /השגחה/.test(walkMetric.value) && /הלכתי|הולך|הולכת/.test(text))) {
    const fact: MemoryFact = { key: "walking_claim", value: text, source: "patient-testimony", at };
    mem.facts = [...mem.facts, fact];
    mem.verifications = [...mem.verifications, { at, claim: text, clinician: `${walkMetric!.label}: ${walkMetric!.value} (${walkMetric!.confirmedBy})` }];
    const alert: DemoAlert = {
      id: uid(), patientId: profile.id, priority: "medium", category: "verification", createdAt: at, quote: text,
      why: `סתירה למדד מאושר: ${walkMetric!.value}`, uncertainty: "עדות סובייקטיבית; המדד המאושר לא שונה.",
      clinicianContext: profile.approvedNotes.join(" · "), targetRole: walkMetric!.confirmedBy, status: "open",
    };
    mem.slot = null;
    return finish(
      `נשמע שאת/ה מרגיש/ה חזק/ה יותר – זה משמח! ברישום של הצוות מופיע "${walkMetric!.value}". אבקש מהפיזיותרפיסט לבדוק איתך. בינתיים, הליכה רק בליווי, בסדר?`,
      { topic: "progress", rule: "VERIFY-CONFLICT", source: "local-rules", technique: "אימות, לא דריסה" }, ["בסדר", "יש לי שאלה"], false, alert);
  }

  // 3.5 Active questionnaire – demo items inside the chat, qualitative insight only, never a score
  if (mem.quiz) {
    const q = answerQuiz(mem.quiz, text.trim());
    if (isDone(q)) {
      mem.quiz = null;
      const insight = qualitativeInsight(q);
      mem.facts = [...mem.facts, { key: `quiz-${q.instrumentId}`, value: insight, source: "patient-testimony", at }];
      return finish(
        `תודה שענית. רשמתי את מה ששיתפת כתובנה איכותנית לצוות – זה לא ציון רפואי ולא תחליף להערכה. רוצה לדבר על משהו נוסף?`,
        { topic: profile.primaryTopic, rule: "QUIZ-DEMO-DONE", source: "local-rules", technique: "סיכום איכותני בלבד – ללא ציון מתוקף" },
        ["תודה", "עוד משהו"],
      );
    }
    mem.quiz = q;
    const next = currentItem(q);
    if (!next) {
      mem.quiz = null;
      return finish("הסקירה הסתיימה. תודה!", { topic: profile.primaryTopic, rule: "QUIZ-DEMO-ABORT", source: "local-rules", technique: "סגירה" });
    }
    return finish(next.item, { topic: profile.primaryTopic, rule: "QUIZ-DEMO-ITEM", source: "local-rules", technique: "פריט מדומה בשיחה – לא הכלי המקורי" }, next.inst.demoScale);
  }

  // 3.6 Questionnaire trigger – starts a demo quiz as contextual chat follow-ups
  if (text.trim() === QUIZ_TRIGGER) {
    const q0 = quizForTopic(profile.primaryTopic);
    const first = q0 ? currentItem(q0) : null;
    if (q0 && first) {
      mem.quiz = q0;
      return finish(
        `${quizDisclaimer}\n${first.item}`,
        { topic: profile.primaryTopic, rule: "QUIZ-DEMO-START", protocolId: first.inst.id, source: "local-rules", technique: "שאלון מדומה כהמשך שיחה – ללא ציון" },
        first.inst.demoScale,
      );
    }
    return finish("אין כרגע סקירה מתאימה לנושא הזה, אבל אני כאן לשיחה.", { topic: profile.primaryTopic, rule: "QUIZ-DEMO-UNAVAILABLE", source: "local-rules", technique: "אין כלי מתאים" });
  }

  // 4. Topic flow with multi-turn slots
  const detected = detectTopic(text, profile);
  const keywordHit = detected !== profile.primaryTopic || Object.values(topicKeywords).some((r) => r.test(text));
  const F = flows(profile);
  const protocol = protocolRegistry.find((p) => profile.protocolIds.includes(p.id) && p.domain === detected) ?? protocolRegistry.find((p) => p.domain === detected);

  if (mem.slot && !keywordHit) {
    const flow = F[mem.slot.topic];
    const trimmed = text.trim();
    const branch = no.test(trimmed) ? flow.negative : yes.test(trimmed) || trimmed.length > 2 ? flow.positive : flow.negative;
    const step = mem.slot.step;
    mem.slot = step >= 2 ? null : { topic: mem.slot.topic, step: step + 1 };
    if (step >= 2) {
      const closeTopic = flow === F.general ? "general" : detected;
      return finish(pick([
        "תודה ששיתפת אותי. אני כאן מתי שתרצה/י לדבר שוב.",
        "שיחה טובה. אם משהו מטריד, הצוות תמיד כאן – ואני גם.",
      ], mem.recentVariants), { topic: closeTopic, rule: "FLOW-CLOSE", source: "local-rules", technique: "סגירה חמה" },
        ["תודה", "עוד משהו", ...(quizForTopic(closeTopic) ? [QUIZ_TRIGGER] : [])]);
    }
    return finish(pick(branch.say, mem.recentVariants),
      { topic: mem.slot?.topic ?? detected, rule: `FLOW-${branch === flow.negative ? "NEG" : "POS"}-${step}`, protocolId: protocol?.id, source: "local-rules", technique: branch.technique }, branch.quick);
  }

  const start = F[detected].start[0] ?? { technique: "פתיחה", say: [`שמח לדבר איתך, ${profile.alias}. איך עובר עליך היום?`] };
  mem.slot = { topic: detected, step: 1 };
  return finish(pick(start.say, mem.recentVariants),
    { topic: detected, rule: keywordHit ? "TOPIC-KEYWORD" : "TOPIC-PROFILE-DEFAULT", protocolId: protocol?.id, source: "local-rules", technique: start.technique }, start.quick);
}

export function greeting(p: PatientProfile): string {
  return `שלום ${p.alias}, אני אורי. אני כאן לשיחה ולעידוד – לא במקום הצוות. איך את/ה מרגיש/ה היום?`;
}
