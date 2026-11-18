import { useEffect, useRef, useState } from "react";
import { createLiveAvatarSession } from "@/lib/cloud.functions";
import { ORI_PHOTO } from "@/lib/avatarAdapter";
import {
  createLiveAvatarController,
  type ClassifiedLiveAvatarError,
  type LiveAvatarSessionLike,
  type LiveAvatarStage,
} from "@/lib/liveavatarClient";

const STAGE_TEXT: Record<LiveAvatarStage, string> = {
  idle: "",
  token: "מנפיק אישור סשן בשרת…",
  webrtc: "פותח חיבור שידור ישיר (WebRTC)…",
  stream: "החיבור נפתח – ממתין לזרם הווידאו של האווטאר…",
  connected: "",
  ended: "השיחה החיה הסתיימה",
  error: "",
};

interface Props {
  /** Switch to the standalone LiveAvatar embed (explicit fallback, not connected to our protocol engine). */
  onFallbackToEmbed?: () => void;
}

/**
 * FULL-mode LiveAvatar session wired to our custom-LLM protocol bridge.
 * A fresh short-lived token is minted server-side on EVERY attempt (the API key
 * never reaches the browser); the SDK then opens the WebRTC room directly.
 * "מחובר" is shown only after the avatar stream is actually attached.
 */
export function LiveAvatarFull({ onFallbackToEmbed }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controllerRef = useRef<ReturnType<typeof createLiveAvatarController> | null>(null);
  const [stage, setStage] = useState<LiveAvatarStage>("idle");
  const [error, setError] = useState<ClassifiedLiveAvatarError | null>(null);

  const getController = () => {
    if (!controllerRef.current) {
      controllerRef.current = createLiveAvatarController({
        mintToken: async () => {
          const r = await createLiveAvatarSession();
          if (!r.ok) throw new Error(`token: ${r.error}`);
          return r.session.sessionToken;
        },
        createSession: (token): LiveAvatarSessionLike => {
          // Loaded lazily so SSR never touches the browser-only SDK.
          return new (sdkRef.current!.LiveAvatarSession)(token, { autoKeepAlive: true });
        },
        videoEl: () => videoRef.current,
        onStage: setStage,
        onError: setError,
        maxDurationSeconds: 120, // account policy cap; session stops just before it
      });
    }
    return controllerRef.current;
  };

  // The SDK module is browser-only; load it once on mount.
  const sdkRef = useRef<typeof import("@heygen/liveavatar-web-sdk") | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void import("@heygen/liveavatar-web-sdk").then((m) => {
      if (alive) {
        sdkRef.current = m;
        setSdkReady(true);
      }
    });
    return () => {
      alive = false;
      void controllerRef.current?.teardown(); // stop tracks/timers on unmount
      controllerRef.current = null;
    };
  }, []);

  const start = () => {
    setError(null);
    void getController().start();
  };

  const stop = () => {
    void getController().stop();
  };

  const connecting = stage === "token" || stage === "webrtc" || stage === "stream";

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="h-full w-full object-cover"
        aria-label="אורי – אווטאר חי מחובר למנוע הפרוטוקולים"
      />
      {stage !== "connected" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-calm/95 p-6 text-center">
          {/* Brand face instead of a black panel while connecting / idle */}
          <img
            src={ORI_PHOTO}
            alt="אורי, המאמן, עם כובע ביחד"
            className="h-24 w-24 rounded-full object-cover shadow-soft"
            style={{ objectPosition: "50% 15%" }}
          />
          {connecting ? (
            <>
              <p className="text-xl" role="status">
                {STAGE_TEXT[stage]}
              </p>
              <p className="text-sm text-muted-foreground">שלב: {stage === "token" ? "1 מתוך 3" : stage === "webrtc" ? "2 מתוך 3" : "3 מתוך 3"}</p>
            </>
          ) : (
            <>
              <p className="text-xl font-semibold text-primary">שיחה חיה עם אורי — דרך גשר הפרוטוקולים</p>
              <p className="max-w-md text-base text-muted-foreground">
                הסשן נפתח בשרת עם תצורת ה־LLM שחיברנו. נתוני דמו סינתטיים בלבד.
              </p>
              {stage === "ended" && <p className="text-base text-muted-foreground">{STAGE_TEXT.ended}</p>}
              {error && (
                <div role="alert" className="flex max-w-md flex-col gap-2 rounded-2xl bg-destructive-soft px-4 py-3 text-right">
                  <p className="text-lg font-semibold text-destructive">{error.title}</p>
                  <p className="text-base text-destructive">{error.detail}</p>
                  <ul className="list-inside list-disc text-sm text-destructive">
                    {error.tips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={start}
                  disabled={!sdkReady}
                  className="min-h-14 rounded-2xl bg-primary px-8 text-xl font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {stage === "ended" || stage === "error" ? "▶ נסה שוב" : "▶ התחל שיחה חיה"}
                </button>
                {stage === "error" && onFallbackToEmbed && (
                  <button
                    type="button"
                    onClick={onFallbackToEmbed}
                    className="min-h-14 rounded-2xl border bg-card px-6 text-lg"
                  >
                    🎥 עבור להטמעה הרגילה
                  </button>
                )}
              </div>
              {stage === "error" && (
                <p className="max-w-md text-sm text-muted-foreground">
                  ההטמעה הרגילה היא סוכן קולי נפרד של LiveAvatar — אינה מחוברת למנוע הפרוטוקולים או לנתוני הדמו.
                </p>
              )}
            </>
          )}
        </div>
      )}
      {stage === "connected" && (
        <button
          type="button"
          onClick={stop}
          aria-label="סיום השיחה החיה"
          className="absolute bottom-3 right-3 min-h-12 rounded-2xl bg-card/90 px-4 text-lg shadow-soft backdrop-blur"
        >
          ⏹ סיים שיחה
        </button>
      )}
    </div>
  );
}
