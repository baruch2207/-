import { createFileRoute } from "@tanstack/react-router";
import { resetDemo, setState, useDemo } from "@/lib/store";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "אורי | ביחד – הגדרות" },
      { name: "description", content: "הגדרות הדגמה: מהירות דיבור, הקראה אוטומטית, בחירת מטופל ואיפוס נתוני דמו." },
      { property: "og:title", content: "אורי | ביחד – הגדרות" },
      { property: "og:description", content: "הגדרות הדגמה של אורי | ביחד." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsScreen,
});

function SettingsScreen() {
  const s = useDemo();

  return (
    <main dir="rtl" className="min-h-screen bg-calm">
      <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
        <h1 className="text-3xl text-primary">הגדרות</h1>

        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <h2 className="text-xl text-primary">מטופל פעיל במסך השיחה</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {s.patients.map((x) => (
              <button
                key={x.id}
                onClick={() => setState((st) => ({ ...st, activePatientId: x.id }))}
                aria-pressed={x.id === s.activePatientId}
                className={`min-h-12 rounded-2xl px-4 text-lg ${x.id === s.activePatientId ? "bg-primary text-primary-foreground" : "border bg-card"}`}
              >
                {x.alias}, {x.age}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <h2 className="text-xl text-primary">קול</h2>
          <label className="mt-3 flex min-h-14 cursor-pointer items-center gap-3 text-xl">
            <input
              type="checkbox"
              checked={s.settings.autoSpeak}
              onChange={(e) => setState((st) => ({ ...st, settings: { ...st.settings, autoSpeak: e.target.checked } }))}
              className="h-6 w-6"
            />
            הקראה אוטומטית של תשובות
          </label>
          <label className="mt-4 block text-lg">
            מהירות דיבור: {s.settings.rate.toFixed(2)}
            <input
              type="range"
              min={0.6}
              max={1.2}
              step={0.02}
              value={s.settings.rate}
              onChange={(e) => setState((st) => ({ ...st, settings: { ...st.settings, rate: Number(e.target.value) } }))}
              className="mt-2 w-full"
              aria-label="מהירות דיבור"
            />
          </label>
        </section>

        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <h2 className="text-xl text-primary">שרת AI (דמו)</h2>
          <label className="mt-3 flex min-h-14 cursor-pointer items-center gap-3 text-xl">
            <input
              type="checkbox"
              checked={s.settings.useServer}
              onChange={(e) => setState((st) => ({ ...st, settings: { ...st.settings, useServer: e.target.checked } }))}
              className="h-6 w-6"
            />
            תשובות AI דרך שרת (נתוני דמו בלבד)
          </label>
          <p className="mt-2 text-muted-foreground">
            כשמופעל, השיחה נשלחת לשרת המאובטח של האפליקציה (המפתח נשאר בשרת בלבד). בדיקות הבטיחות מתבצעות תמיד לפני המודל.
            אם השרת לא זמין, המערכת חוזרת אוטומטית למנוע הכללים המקומי.
          </p>
        </section>

        <section className="rounded-3xl bg-card p-6 shadow-soft">
          <h2 className="text-xl text-primary">נתוני דמו</h2>
          <p className="mt-1 text-muted-foreground">כל הנתונים סינתטיים ונשמרים בדפדפן בלבד.</p>
          <button
            onClick={() => resetDemo()}
            className="mt-4 min-h-14 rounded-2xl bg-destructive px-6 text-xl text-destructive-foreground"
          >
            איפוס כל נתוני הדמו
          </button>
        </section>
      </div>
    </main>
  );
}
