import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBridgeStatus, getLiveAvatarConfig, provisionLiveAvatarBridge } from "@/lib/cloud.functions";

// Must be a URL that LiveAvatar's servers can actually reach: the published
// origin returns 403 until the app is published, so the preview origin is used
// while the app stays unpublished. Re-provision with the published URL after publishing.
const BRIDGE_BASE_URL = "https://id-preview--521fbb5d-3a55-4ba3-b0f7-65cb70436c75.lovable.app/api/liveavatar/v1";
const BRIDGE_MODEL = "openai/gpt-6-astra";

export const Route = createFileRoute("/_authenticated/liveavatar")({
  head: () => ({
    meta: [
      { title: "אורי | ביחד – חיבור LiveAvatar" },
      { name: "description", content: "סטטוס והוראות חיבור של אווטאר LiveAvatar חי למנוע הפרוטוקולים – דמו סינתטי." },
      { property: "og:title", content: "אורי | ביחד – חיבור LiveAvatar" },
      { property: "og:description", content: "סטטוס חיבור LiveAvatar למנוע השיחה – דמו בלבד." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LiveAvatarStatusScreen,
});

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border p-4">
      <span className="font-semibold">{label}: </span>
      {children}
    </li>
  );
}

function LiveAvatarStatusScreen() {
  const status = useQuery({ queryKey: ["bridge-status"], queryFn: () => getBridgeStatus(), retry: false });
  const st = status.data;
  const connected = st?.secretConfigured === true && st.verified === true;

  return (
    <main dir="rtl" className="min-h-screen bg-calm">
      <div className="bg-warning-soft px-4 py-2 text-center text-base">סימולציה – נתונים סינתטיים בלבד</div>
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <h1 className="text-3xl text-primary">חיבור LiveAvatar למנוע הפרוטוקולים</h1>

        <section className="rounded-3xl bg-card p-6 shadow-soft" aria-label="סטטוס החיבור">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl text-primary">סטטוס</h2>
            {status.isLoading && <span className="rounded-full bg-secondary px-4 py-1 text-lg">בודק…</span>}
            {status.isError && <span className="rounded-full bg-secondary px-4 py-1 text-lg">לא ניתן לבדוק (נדרשת הרשאת צוות)</span>}
            {st && (
              <span
                className={`rounded-full px-4 py-1 text-lg font-semibold ${connected ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"}`}
              >
                {connected ? "גשר שרת נבדק" : "גשר שרת לא נבדק"}
              </span>
            )}
          </div>
          {st && (
            <ul className="mt-4 space-y-2 text-lg">
              <Row label="מפתח גשר מוגדר בשרת">{st.secretConfigured ? "כן" : "לא – יש להגדיר (שלב 1 למטה)"}</Row>
              <Row label="בקשות מורשיות שהתקבלו בגשר">
                {st.verified
                  ? `${st.verifiedRequestCount} בקשות · לאחרונה: ${new Date(st.lastVerifiedAt!).toLocaleString("he-IL")}`
                  : "עדיין אף לא אחת – הסטטוס ישתנה רק אחרי בקשה אמיתית עם המפתח"}
              </Row>
              <Row label="חיבור סוכן LiveAvatar אמיתי (סשן FULL)">
                <span className="font-semibold text-destructive">טרם אומת חיבור LiveAvatar</span>
                <span className="block text-base text-muted-foreground">
                  בקשות הגשר שנרשמו אינן מוכיחות שהאווטאר עצמו מחובר. הגשר אינו יכול לזהות סשן FULL לגיטימי, וההטמעה
                  הקיימת במסך המטופל אינה מנתבת דיבור דרך הגשר. הסטטוס הזה יישאר "טרם אומת" עד שייווצר סשן FULL חדש עם
                  הגדרת ה־LLM ויתבצע אימות מול חשבון LiveAvatar שלכם.
                </span>
              </Row>
            </ul>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            הסטטוס מוצג רק לצוות מחובר, ומשקף בקשות מאומתות בפועל – לא הגדרות בלבד.
          </p>
        </section>

        <section className="rounded-3xl bg-card p-6 shadow-soft" aria-label="יצירת החיבור מהשרת">
          <h2 className="text-xl text-primary">יצירת החיבור בחשבון LiveAvatar (מהשרת)</h2>
          <p className="mt-2 text-lg">
            הכפתור יוצר בחשבונכם את ה־Secret (מסוג <code dir="ltr">LLM_API_KEY</code>) ואת תצורת ה־LLM שמפנה לגשר השרת,
            באמצעות מפתח ה־API ששמרתם ב־<code dir="ltr">LIVEAVATAR_API_KEY</code>. שני המפתחות נשארים בשרת בלבד ואינם
            מוצגים כאן או בדפדפן.
          </p>
          <ProvisioningPanel />
        </section>

        <section className="rounded-3xl bg-card p-6 shadow-soft" aria-label="הוראות הגדרה">
          <h2 className="text-xl text-primary">הגדרה ב-LiveAvatar (מצב FULL עם LLM מותאם)</h2>
          <ol className="mt-3 list-decimal space-y-3 pr-6 text-lg">
            <li>
              <strong>החלפת מפתח הגשר הזמני – חובה לפני חיבור האווטאר:</strong> במהלך הפיתוח הוגדר ערך בדיקה זמני ב־
              <code dir="ltr">LIVEAVATAR_BRIDGE_SECRET</code>. <strong>יש לבטלו ולהחליפו לפני שמצמידים את LiveAvatar:</strong>{" "}
              צרו ערך אקראי חזק חדש (למשל במנהל סיסמאות או <code dir="ltr">openssl rand -hex 32</code>) ושמרו אותו ב־
              <strong>Project Settings → Secrets</strong> באותו השם. הערך נשאר בשרת בלבד ואינו מוצג בשום מקום באפליקציה.
            </li>
            <li>
              <strong>בחשבון LiveAvatar שלכם, דרך לוח הבקרה המאובטח בלבד:</strong> צרו Secret מסוג{" "}
              <code dir="ltr">LLM_API_KEY</code> עם אותו הערך החדש בדיוק. אל תשלחו את המפתח בצ'אט או בערוצים אחרים.
            </li>
            <li>
              <strong>צרו LLM configuration</strong> מסוג OpenAI-compatible עם:
              <ul className="mt-2 list-disc space-y-1 pr-6">
                <li dir="ltr" className="text-left">base_url = {BRIDGE_BASE_URL}</li>
                <li dir="ltr" className="text-left">model_name = openai/gpt-6-astra</li>
                <li>הנתיב המלא שנבנה הוא <code dir="ltr">/api/liveavatar/v1/chat/completions</code> (LiveAvatar מוסיף /chat/completions לבסיס).</li>
              </ul>
            </li>
            <li>
              <strong>פרסום מקור הדמו – רק בהסכמה מפורשת:</strong> כתובת ה־base_url למעלה היא מקור הפריסה של האפליקציה.
              פרסמו גרסת דמו שנבדקה <strong>רק אחרי אישור מפורש שלכם</strong>, וודאו שהכתובת שמזינים ב־LiveAvatar היא מקור
              הדמו הפרסום ולא כתובת זמנית אחרת.
            </li>
            <li>
              <strong>צרו סשן/הטמעה חדשים במצב FULL</strong> והעבירו את <code dir="ltr">llm_configuration_id</code> שיצרתם בטוקן הסשן.
              שימו לב: ההטמעה הקיימת במסך המטופל (embed חד־לחצני) <strong>אינה ניתנת להגדרה מחדש</strong> עם LLM מותאם –
              יש ליצור סשן/הטמעה חדשים בחשבונכם ולעדכן את כתובת ה־iframe במסך המטופל.
            </li>
            <li>
              <strong>אימות:</strong> אחרי שיחת בדיקה דרך האווטאר, רעננו דף זה – שורת הבקשות המורשיות תתעדכן רק כשבקשה עם
              המפתח אכן התקבלה. שורת "חיבור סוכן LiveAvatar אמיתי" תישאר "טרם אומת" עד אימות מול חשבון LiveAvatar שלכם.
            </li>
          </ol>
          <p className="mt-4 text-lg">
            תיעוד רשמי:{" "}
            <a href="https://docs.liveavatar.com/docs/full-mode/custom-llm" target="_blank" rel="noreferrer" className="text-primary underline">
              Custom LLM
            </a>{" "}
            ·{" "}
            <a href="https://docs.liveavatar.com/docs/full-mode/overview" target="_blank" rel="noreferrer" className="text-primary underline">
              Full mode overview
            </a>
          </p>
        </section>

        <section className="rounded-3xl bg-card p-6 shadow-soft" aria-label="מה הגשר עושה">
          <h2 className="text-xl text-primary">מה קורה בשרת כשהחיבור פעיל</h2>
          <ul className="mt-3 list-disc space-y-1 pr-6 text-lg">
            <li>בדיקת בטיחות דטרמיניסטית (כאב בחזה, קוצר נשימה, בלבול, אובדנות, התעללות) רצה <strong>לפני</strong> המודל ומחזירה הנחיה לקרוא לצוות.</li>
            <li>כל ששת פרוטוקולי ה־CBT נטענים; ההפעלה נקבעת לפי תוכן דברי המטופל, לא רק לפי פרופיל.</li>
            <li>הקשר מטופל סינתטי בלבד מהדמו; לא מתקבלים נתוני מטופלים אמיתיים.</li>
            <li>תשובות קצרות בעברית, שאלה אחת בכל פעם, ללא תרגילים חדשים; תוכן השיחה אינו נרשם ביומנים.</li>
            <li>בתקלה בשירות ה־AI מוחזרת תשובה קבועה מראש – ללא הצגת מצב כאילו ה־AI פעיל.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

function ProvisioningPanel() {
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ["liveavatar-config"], queryFn: () => getLiveAvatarConfig(), retry: false });
  const provision = useMutation({
    mutationFn: () => provisionLiveAvatarBridge({ data: { baseUrl: BRIDGE_BASE_URL, modelName: BRIDGE_MODEL } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["liveavatar-config"] }),
  });

  if (config.isLoading) return <p className="mt-3 text-lg">בודק תצורה…</p>;
  if (config.isError) return <p className="mt-3 text-lg">לא ניתן לבדוק (נדרשת הרשאת צוות).</p>;

  const stored = config.data?.config ?? null;
  const apiKeyReady = config.data?.apiKeyConfigured === true;

  return (
    <div className="mt-4 space-y-3 text-lg">
      <p>
        מפתח LiveAvatar בשרת:{" "}
        <strong className={apiKeyReady ? "text-success" : "text-destructive"}>
          {apiKeyReady ? "מוגדר" : "לא מוגדר – שמרו אותו ב־Project Settings → Secrets תחת LIVEAVATAR_API_KEY"}
        </strong>
      </p>
      {stored ? (
        <div className="rounded-2xl border p-4">
          <p className="font-semibold text-success">התצורה נוצרה בחשבון LiveAvatar</p>
          <ul className="mt-2 space-y-1" dir="ltr">
            <li className="text-left">llm_configuration_id: {stored.llmConfigurationId}</li>
            <li className="text-left">secret_id: {stored.llmSecretId}</li>
            <li className="text-left">base_url: {stored.baseUrl}</li>
            <li className="text-left">model_name: {stored.modelName}</li>
          </ul>
          <p className="mt-2 text-base text-muted-foreground" dir="rtl">
            נוצר ב־{new Date(stored.provisionedAt).toLocaleString("he-IL")}. העבירו את ה־llm_configuration_id בטוקן של
            סשן FULL חדש. סטטוס "חיבור סוכן LiveAvatar אמיתי" יישאר "טרם אומת" עד שיחת בדיקה אמיתית דרך הסשן.
          </p>
          <button
            type="button"
            disabled={!apiKeyReady || provision.isPending}
            onClick={() => provision.mutate()}
            className="mt-3 min-h-12 rounded-2xl border bg-card px-5 text-lg disabled:opacity-50"
          >
            {provision.isPending ? "יוצר מחדש ב־LiveAvatar…" : "↻ צור תצורה מחדש עם כתובת הגשר הנוכחית"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={!apiKeyReady || provision.isPending}
          onClick={() => provision.mutate()}
          className="min-h-14 rounded-2xl bg-primary px-6 text-xl font-semibold text-primary-foreground disabled:opacity-50"
        >
          {provision.isPending ? "יוצר ב־LiveAvatar…" : "צור את ה־Secret ותצורת ה־LLM ב־LiveAvatar"}
        </button>
      )}
      {provision.data && !provision.data.ok && (
        <p role="alert" className="rounded-2xl bg-destructive-soft p-3 text-destructive">
          {provision.data.error}
        </p>
      )}
      {provision.isError && (
        <p role="alert" className="rounded-2xl bg-destructive-soft p-3 text-destructive">
          שגיאה ביצירת התצורה – נסו שוב או בדקו את מפתח ה־API.
        </p>
      )}
    </div>
  );
}
