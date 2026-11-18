import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSimliStatus } from "@/lib/simli.functions";
import { canStartPaidSession, SIMLI_MAX_IDLE_SECONDS, SIMLI_MAX_SESSION_SECONDS } from "@/lib/simliCore";
import { SimliAvatar } from "@/components/SimliAvatar";
import { activePatient, useDemo } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/simli")({
  head: () => ({
    meta: [
      { title: "אורי | ביחד – חיבור Simli (צוות)" },
      { name: "description", content: "סטטוס וסשן בדיקה של אווטאר וידאו Simli – לצוות בלבד, נתוני דמו." },
      { property: "og:title", content: "אורי | ביחד – חיבור Simli" },
      { property: "og:description", content: "בדיקת אווטאר וידאו Simli לצוות – סימולציה בלבד." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SimliScreen,
});

const yes = (b: boolean) => (b ? "✅ כן" : "❌ לא");

function SimliScreen() {
  const s = useDemo();
  const p = activePatient(s);
  const q = useQuery({ queryKey: ["simli-status"], queryFn: () => getSimliStatus(), retry: false });
  const st = q.data;
  const canStart = st ? canStartPaidSession(st, true) : false;

  return (
    <main dir="rtl" className="min-h-screen bg-calm">
      <div className="bg-warning-soft px-4 py-2 text-center text-base">סימולציה – אין שימוש במטופלים אמיתיים</div>
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <h1 className="text-3xl text-primary">אווטאר וידאו Simli (צוות)</h1>

        {st && !st.rotationConfirmed && (
          <section role="alert" className="rounded-3xl border-4 border-destructive bg-destructive-soft p-5">
            <h2 className="text-xl font-bold">⚠️ יש להחליף את מפתח Simli</h2>
            <ol className="mt-2 list-decimal space-y-1 pe-5">
              <li>המפתח הנוכחי נכתב בצ'אט ולכן נחשף. אל תשתמשו בו.</li>
              <li>ב־app.simli.com ← API Keys: בטלו (Revoke) את המפתח הישן וצרו מפתח חדש.</li>
              <li>בקשו כאן בצ'אט "פתח טופס מאובטח למפתח Simli" והדביקו את המפתח החדש רק בטופס — לעולם לא בצ'אט.</li>
              <li>אחרי השמירה, הסשנים בתשלום ייפתחו לבדיקה.</li>
            </ol>
          </section>
        )}

        <section className="rounded-3xl bg-card p-6 shadow-soft" aria-label="סטטוס">
          <h2 className="text-xl text-primary">סטטוס</h2>
          {q.isLoading && <p>בודק…</p>}
          {q.isError && <p>לא ניתן לבדוק (נדרשת הרשאת צוות).</p>}
          {st && (
            <ul className="mt-3 space-y-2 text-lg">
              <li>מפתח Simli שמור בשרת: {yes(st.apiKeyConfigured)}</li>
              <li>המפתח הוחלף אחרי החשיפה: {yes(st.rotationConfirmed)}</li>
              <li>Face ID של אורי: {st.faceIdConfigured ? "✅ מוגדר" : "❌ לא — ישמשו פנים לדוגמה של Simli (לא אורי)"}</li>
              <li>זיהוי דיבור: מיקרופון בדפדפן (כשנתמך) או הקלדה</li>
              <li>תשובות AI: מנוע השיחה הקיים עם בדיקות הבטיחות והפרוטוקולים</li>
              <li>קול: נוצר בשרת (Lovable AI) ונשלח ל־Simli לסנכרון שפתיים — יאומת רק בסשן אמיתי</li>
            </ul>
          )}
          <p className="mt-4 rounded-xl bg-warning-soft p-3 text-sm">
            עלות: כל סשן נספר כדקות בתשלום ב־Simli. הגבלה בשרת: עד {SIMLI_MAX_SESSION_SECONDS} שניות לסשן, ניתוק אחרי {SIMLI_MAX_IDLE_SECONDS} שניות שקט. אין הפעלה אוטומטית.
          </p>
        </section>

        <section className="rounded-3xl bg-card p-6 shadow-soft" aria-label="סשן בדיקה">
          <h2 className="mb-3 text-xl text-primary">סשן בדיקה {p ? `— ${p.alias} (דמו)` : ""}</h2>
          {p ? <SimliAvatar patientId={p.id} canStart={canStart} /> : <p>בחרו מטופל דמו במסך הצוות.</p>}
        </section>
      </div>
    </main>
  );
}
