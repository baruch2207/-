import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Element fullscreen. Uses the native API when allowed; otherwise (iframes like the
 * preview, iOS Safari) falls back to a fixed full-viewport overlay so it always works.
 */
export function useFullscreen<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pseudo = useRef(false);

  const setPseudo = (on: boolean) => {
    const el = ref.current;
    pseudo.current = on;
    if (el) {
      const s = el.style;
      if (on) Object.assign(s, { position: "fixed", inset: "0", zIndex: "1000", width: "100vw", height: "100dvh" });
      else { s.position = s.inset = s.zIndex = s.width = s.height = ""; }
    }
    document.body.style.overflow = on ? "hidden" : "";
    setIsFullscreen(on);
  };

  const setPseudoRef = useRef(setPseudo);
  setPseudoRef.current = setPseudo;
  useEffect(() => {
    const onChange = () => { if (!pseudo.current) setIsFullscreen(document.fullscreenElement === ref.current); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && pseudo.current) setPseudoRef.current(false); };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (pseudo.current) setPseudoRef.current(false);
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement === ref.current) void document.exitFullscreen().catch(() => {});
      document.body.style.overflow = "";
    };
  }, []);

  const toggle = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    if (pseudo.current) { setPseudo(false); return; }
    if (document.fullscreenElement) { await document.exitFullscreen().catch(() => {}); setIsFullscreen(false); return; }
    try {
      const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
      if (inFrame || typeof el.requestFullscreen !== "function" || document.fullscreenEnabled === false) throw new Error("no api");
      await el.requestFullscreen();
      setIsFullscreen(true);
    } catch {
      setPseudo(true);
    }
  }, []);

  return { ref, isFullscreen, unsupported: false, toggle };
}
