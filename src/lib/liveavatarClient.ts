/**
 * Client-side controller for a LiveAvatar FULL session (SDK-agnostic, testable).
 *
 * Root cause of the "black panel" bug: the SDK's `attach()` returns early until
 * BOTH remote audio and video tracks are subscribed. Calling it once right after
 * `start()` therefore never attaches anything. The correct flow is to subscribe
 * to `SESSION_STREAM_READY` BEFORE `start()` and attach inside that handler.
 */

export type LiveAvatarStage =
  | "idle"
  | "token" // minting a fresh short-lived session token on the server
  | "webrtc" // opening the LiveKit/WebRTC room
  | "stream" // room connected, waiting for avatar audio+video tracks
  | "connected" // stream attached to the <video> element
  | "ended"
  | "error";

export type LiveAvatarErrorKind = "token" | "mic" | "transport" | "server" | "unknown";

export interface ClassifiedLiveAvatarError {
  kind: LiveAvatarErrorKind;
  title: string;
  detail: string;
  tips: string[];
}

const TRANSPORT_HINTS = [
  "pc connection",
  "could not establish",
  "ice",
  "livekit",
  "websocket",
  "webrtc",
  "connectionerror",
  "network",
  "timed out",
  "timeout",
  "failed to fetch",
];

const MIC_HINTS = [
  "notallowederror",
  "permission denied",
  "permission dismissed",
  "microphone",
  "getusermedia",
  "notfounderror",
  "notreadableerror",
  "overconstrained",
];

const SERVER_HINTS = ["sessionapierror", " 5", "status 5", "internal server", "503", "502", "500"];

function messageOf(err: unknown): string {
  if (err instanceof Error) return `${err.name} ${err.message}`.toLowerCase();
  return String(err ?? "").toLowerCase();
}

/** Classify an SDK/network failure into a sanitized Hebrew explanation. Never includes tokens or credentials. */
export function classifyLiveAvatarError(err: unknown): ClassifiedLiveAvatarError {
  const msg = messageOf(err);

  if (MIC_HINTS.some((h) => msg.includes(h))) {
    return {
      kind: "mic",
      title: "אין גישה למיקרופון",
      detail: "הדפדפן חסם את הגישה למיקרופון, לכן לא ניתן לפתוח שיחה חיה.",
      tips: [
        "בכרום: הקש על סמל המנעול בשורת הכתובת ← הרשאות ← מיקרופון ← אפשר",
        "ודא שאף אפליקציה אחרת לא תופסת את המיקרופון",
        "לאחר האישור, נסה שוב",
      ],
    };
  }

  if (TRANSPORT_HINTS.some((h) => msg.includes(h))) {
    return {
      kind: "transport",
      title: "תעבורת הרשת לשידור החי נכשלה",
      detail:
        "לא ניתן להשלים את חיבור ה־WebRTC; ייתכן שהגורם הוא הגדרות רשת/VPN, דפדפן, או שירות הסטרימינג. הסיבה המדויקת לא אומתה.",
      tips: [
        "כבה VPN זמנית אם מופעל",
        "עבור בין Wi‑Fi לגלישה סלולרית (או להפך)",
        "ודא שכרום מורשה להשתמש במיקרופון באתר זה",
        "נסה שוב לאחר החלפת הרשת",
      ],
    };
  }

  if (SERVER_HINTS.some((h) => msg.includes(h))) {
    return {
      kind: "server",
      title: "שירות האווטאר אינו זמין כרגע",
      detail: "שרת LiveAvatar החזיר שגיאה בעת פתיחת הסשן.",
      tips: ["נסה שוב בעוד דקה", "אם הבעיה נמשכת, עבור להטמעה הרגילה"],
    };
  }

  return {
    kind: "unknown",
    title: "החיבור לאווטאר נכשל",
    detail: "אירעה שגיאה לא צפויה בעת פתיחת השיחה החיה.",
    tips: ["נסה שוב", "אפשר לעבור להטמעה הרגילה (אינה מחוברת למנוע הפרוטוקולים)"],
  };
}

/** Minimal structural interface of the SDK session — allows a mock in tests. */
export interface LiveAvatarSessionLike {
  start(): Promise<void>;
  stop(): Promise<void>;
  attach(element: HTMLMediaElement): void;
  on(event: string, cb: (...args: unknown[]) => void): unknown;
  off?(event: string, cb: (...args: unknown[]) => void): unknown;
  readonly maxSessionDuration?: number | null;
}

// String literals match the SDK's SessionEvent / SessionState enums.
export const SDK_EVENTS = {
  STREAM_READY: "session.stream_ready",
  STATE_CHANGED: "session.state_changed",
  DISCONNECTED: "session.disconnected",
} as const;

/** Thrown when session.start() does not settle in time (the SDK's websocket connect can hang forever). */
export class LiveAvatarTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveAvatarTimeoutError";
  }
}

export interface LiveAvatarControllerDeps {
  /** Mints a FRESH short-lived token on the server. Called on every start attempt — tokens are never reused. */
  mintToken: () => Promise<string>;
  createSession: (token: string) => LiveAvatarSessionLike;
  videoEl: () => HTMLMediaElement | null;
  onStage: (stage: LiveAvatarStage) => void;
  onError: (error: ClassifiedLiveAvatarError) => void;
  /** Hard cap for the session in seconds (account policy). Session auto-stops shortly before it. */
  maxDurationSeconds?: number | undefined;
  /** Max wait for session.start() to settle (SDK region retries make this slow). Default 30s. */
  startTimeoutMs?: number | undefined;
  /** Max wait for the avatar stream after the room reports CONNECTED. Default 20s. */
  streamTimeoutMs?: number | undefined;
}

export interface LiveAvatarController {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** Idempotent cleanup for unmount / failure paths. */
  teardown: () => Promise<void>;
  isBusy: () => boolean;
}

export function createLiveAvatarController(deps: LiveAvatarControllerDeps): LiveAvatarController {
  let session: LiveAvatarSessionLike | null = null;
  let starting = false;
  let stopping = false;
  let limitTimer: ReturnType<typeof setTimeout> | null = null;
  let streamTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (limitTimer) {
      clearTimeout(limitTimer);
      limitTimer = null;
    }
    if (streamTimer) {
      clearTimeout(streamTimer);
      streamTimer = null;
    }
  };

  const fail = async (err: unknown) => {
    await teardown();
    deps.onError(classifyLiveAvatarError(err));
    deps.onStage("error");
  };

  const teardown = async () => {
    clearTimers();
    const s = session;
    session = null;
    if (s) {
      try {
        await s.stop();
      } catch {
        // already closed
      }
    }
  };

  // All handlers are bound to a specific session instance: callbacks from a
  // stale previous session (e.g. after a retry) must never touch current state.
  const onStreamReady = (s: LiveAvatarSessionLike) => () => {
    if (s !== session) return;
    if (streamTimer) {
      clearTimeout(streamTimer);
      streamTimer = null;
    }
    const el = deps.videoEl();
    if (!el) return;
    s.attach(el); // safe here: both tracks are guaranteed subscribed
    deps.onStage("connected");
  };

  const onStateChanged = (s: LiveAvatarSessionLike) => (state: unknown) => {
    if (s !== session || state !== "CONNECTED") return;
    deps.onStage("stream"); // room up, waiting for avatar tracks
    // If the avatar tracks never arrive, error out instead of waiting forever.
    streamTimer = setTimeout(() => {
      void fail(new LiveAvatarTimeoutError("stream ready timeout: avatar tracks never arrived"));
    }, deps.streamTimeoutMs ?? 20_000);
  };

  const onDisconnected = (s: LiveAvatarSessionLike) => () => {
    // Ignore: stale sessions, our own stop() (it sets the stage itself), and
    // disconnects emitted by the SDK while start() is failing — the catch in
    // start() already reports the categorized 'error' stage for those.
    if (s !== session || starting || stopping) return;
    void teardown().then(() => deps.onStage("ended"));
  };

  const start = async () => {
    if (starting || session) return; // single-flight: no simultaneous attempts
    starting = true;
    try {
      deps.onStage("token");
      const token = await deps.mintToken(); // fresh token per click; expired tokens are never reused
      const s = deps.createSession(token);
      session = s;
      // Subscribe BEFORE start() so we never miss the stream-ready event.
      s.on(SDK_EVENTS.STREAM_READY, onStreamReady(s));
      s.on(SDK_EVENTS.STATE_CHANGED, onStateChanged(s));
      s.on(SDK_EVENTS.DISCONNECTED, onDisconnected(s));
      deps.onStage("webrtc");
      // The SDK retries several LiveKit regions (~15s each) and its websocket
      // connect promise can hang forever — cap the whole start() so the UI
      // can never stick on "מתחבר".
      const startTimeoutMs = deps.startTimeoutMs ?? 30_000;
      let startTimer: ReturnType<typeof setTimeout> | null = null;
      try {
        await Promise.race([
          s.start(),
          new Promise<never>((_, reject) => {
            startTimer = setTimeout(
              () => reject(new LiveAvatarTimeoutError(`start timeout after ${startTimeoutMs}ms`)),
              startTimeoutMs,
            );
          }),
        ]);
      } finally {
        if (startTimer) clearTimeout(startTimer);
      }

      // Respect the account's session time limit (auto-stop slightly before it).
      const limit = s.maxSessionDuration ?? deps.maxDurationSeconds;
      if (limit && limit > 0) {
        limitTimer = setTimeout(() => {
          void teardown().then(() => deps.onStage("ended"));
        }, Math.max(limit - 5, 5) * 1000);
      }
    } catch (err) {
      await fail(err);
    } finally {
      starting = false;
    }
  };

  const stop = async () => {
    if (stopping) return; // idempotent
    stopping = true;
    try {
      await teardown();
      deps.onStage("ended");
    } finally {
      stopping = false;
    }
  };

  return {
    start,
    stop,
    teardown,
    isBusy: () => starting || session !== null,
  };
}
