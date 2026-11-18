import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Auth gate for the staff area. The session lives in localStorage, which the
// server cannot read, so this layout is client-only (ssr: false). The check runs
// in the component (not beforeLoad redirect) to avoid a router crash on sign-out redirect.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Gate,
});

function Gate() {
  const navigate = useNavigate();
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      if (data.user) setOk(true);
      else { setOk(false); void navigate({ to: "/auth", replace: true }); }
    });
    return () => { alive = false; };
  }, [navigate]);
  if (!ok) return <p className="p-6 text-lg">טוען…</p>;
  return <Outlet />;
}
