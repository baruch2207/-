import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "אורי | ביחד – כניסת צוות" },
      { name: "description", content: "התחברות מאובטחת למסכי הצוות – סביבת דמו עם נתונים סינתטיים בלבד." },
      { property: "og:title", content: "אורי | ביחד – כניסת צוות" },
      { property: "og:description", content: "התחברות למסכי הצוות – דמו בלבד." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthScreen,
});

function AuthScreen() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedInEmail(data.user?.email ?? null));
  }, []);

  const afterAuth = () => void navigate({ to: "/staff" });

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setMsg("נשלח אליך מייל אימות – יש לאשר את החשבון ואז להתחבר.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      afterAuth();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setMsg(detail ? `ההתחברות נכשלה: ${detail}` : "ההתחברות נכשלה – בדקו את הפרטים ונסו שוב.");
    } finally {
      setBusy(false);
    }
  };

  const social = async (provider: "google" | "lovable") => {
    setBusy(true);
    setMsg(null);
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result.error) {
      setMsg("ההתחברות נכשלה – נסו שוב.");
      setBusy(false);
      return;
    }
    if (result.redirected) return; // הדפדפן מועבר לספק ההזדהות
    afterAuth();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSignedInEmail(null);
  };

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-calm p-4">
      <div className="w-full max-w-md rounded-3xl bg-card p-8 shadow-soft">
        <div className="rounded-2xl bg-warning-soft px-4 py-2 text-center text-base">
          סביבת דמו – נתונים סינתטיים בלבד, אין מטופלים אמיתיים
        </div>
        <h1 className="mt-4 text-3xl text-primary">כניסת צוות</h1>

        {signedInEmail ? (
          <div className="mt-4 space-y-4">
            <p className="text-lg">מחובר/ת כ־{signedInEmail}</p>
            <button
              onClick={afterAuth}
              className="min-h-14 w-full rounded-2xl bg-primary px-6 text-xl text-primary-foreground"
            >
              למסך הצוות ←
            </button>
            <button
              onClick={() => void signOut()}
              className="min-h-12 w-full rounded-2xl border px-6 text-lg"
            >
              התנתקות
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2" role="tablist" aria-label="מצב התחברות">
              <button
                role="tab"
                aria-selected={mode === "signin"}
                onClick={() => { setMode("signin"); setMsg(null); }}
                className={`min-h-12 rounded-2xl text-lg ${mode === "signin" ? "bg-primary text-primary-foreground" : "border bg-card"}`}
              >
                התחברות
              </button>
              <button
                role="tab"
                aria-selected={mode === "signup"}
                onClick={() => { setMode("signup"); setMsg(null); }}
                className={`min-h-12 rounded-2xl text-lg ${mode === "signup" ? "bg-primary text-primary-foreground" : "border bg-card"}`}
              >
                הרשמה
              </button>
            </div>

            <form onSubmit={(e) => void submitEmail(e)} className="mt-4 space-y-3">
              <label className="block text-lg">
                דוא״ל
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 min-h-14 w-full rounded-2xl border bg-background px-4 text-lg"
                />
              </label>
              <label className="block text-lg">
                סיסמה
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 min-h-14 w-full rounded-2xl border bg-background px-4 text-lg"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="min-h-14 w-full rounded-2xl bg-primary px-6 text-xl text-primary-foreground disabled:opacity-50"
              >
                {mode === "signin" ? "התחברות" : "יצירת חשבון דמו"}
              </button>
            </form>

            <div className="mt-4 space-y-2">
              <button
                onClick={() => void social("google")}
                disabled={busy}
                className="min-h-12 w-full rounded-2xl border bg-card px-6 text-lg disabled:opacity-50"
              >
                המשך עם Google
              </button>
              <button
                onClick={() => void social("lovable")}
                disabled={busy}
                className="min-h-12 w-full rounded-2xl border bg-card px-6 text-lg disabled:opacity-50"
              >
                המשך עם Lovable
              </button>
            </div>

            {msg && (
              <p role="status" className="mt-4 rounded-2xl bg-secondary p-3 text-lg">
                {msg}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
