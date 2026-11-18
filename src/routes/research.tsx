import { createFileRoute } from "@tanstack/react-router";
import { PROTOCOL_REGISTRY_VERSION, RESEARCH_MARKER, instrumentRegistry, protocolRegistry, references } from "@/lib/protocols";

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "אורי | ביחד – מחקר וראיות" },
      { name: "description", content: "בסיס הראיות של פרוטוקולי השיחה, כלי המדידה והפניות לספרות – דמו בלבד." },
      { property: "og:title", content: "אורי | ביחד – מחקר וראיות" },
      { property: "og:description", content: "בסיס ראיות ופרוטוקולים – דמו בלבד." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResearchScreen,
});

function ResearchScreen() {
  return (
    <main dir="rtl" className="min-h-screen bg-calm">
      <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-8">
        <header>
          <h1 className="text-3xl text-primary">מחקר וראיות</h1>
          <p className="mt-2 text-muted-foreground">גרסת רישום פרוטוקולים: {PROTOCOL_REGISTRY_VERSION}</p>
          <p className="mt-3 rounded-2xl bg-warning-soft p-4 text-lg">{RESEARCH_MARKER}</p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl text-primary">פרוטוקולי שיחה ({protocolRegistry.length})</h2>
          {protocolRegistry.map((pr) => (
            <article key={pr.id} className="rounded-3xl bg-card p-6 shadow-soft">
              <h3 className="text-xl font-semibold">{pr.name}</h3>
              <p className="text-sm text-muted-foreground">מזהה: {pr.id} · גרסה {pr.version} · תחום: {pr.domain}</p>
              <p className="mt-2"><span className="font-semibold">גבולות:</span> {pr.boundaryTags.join(" · ")}</p>
              <p className="mt-1"><span className="font-semibold">טכניקות:</span> {pr.techniques.join(" · ")}</p>
              <p className="mt-1 text-destructive"><span className="font-semibold">אין לעשות:</span> {pr.doNot.join(" · ")}</p>
              <ul className="mt-3 space-y-1">
                {pr.citations.map((c) => (
                  <li key={c.url} className="text-sm">
                    <a href={c.url} target="_blank" rel="noreferrer" className="text-primary underline">{c.title}</a>
                    {" "}– <span className="font-semibold">{c.evidence}</span>. {c.note}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl text-primary">כלי מדידה (פריטים מדומים בלבד)</h2>
          <p className="rounded-2xl bg-destructive-soft p-4 text-lg">
            ציון מתוקף מותר רק כאשר כל הפריטים הרשמיים המאושרים ניתנים ללא שינוי. בדמו זה הפריטים מדומים,
            ולכן המערכת מתעדת תובנות איכותניות בלבד ואינה מפיקה ציונים.
          </p>
          {instrumentRegistry.map((inst) => (
            <article key={inst.id} className="rounded-3xl bg-card p-6 shadow-soft">
              <h3 className="text-xl font-semibold">{inst.name} – {inst.construct}</h3>
              <p className="text-sm text-muted-foreground">ממלא/ת: {inst.rater} · רישיון: {inst.licenseNote}</p>
              <a href={inst.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-primary underline">מקור רשמי</a>
              <ul className="mt-2 list-disc pr-5 text-sm">
                {inst.demoItems.map((it) => <li key={it}>{it}</li>)}
              </ul>
            </article>
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="text-2xl text-primary">מקורות נוספים</h2>
          <ul className="space-y-2">
            {references.map((r) => (
              <li key={r.url} className="rounded-2xl bg-card p-4 shadow-soft">
                <a href={r.url} target="_blank" rel="noreferrer" className="text-primary underline">{r.title}</a>
                {" "}– <span className="font-semibold">{r.evidence}</span>. {r.note}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
