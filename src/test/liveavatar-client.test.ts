import { describe, expect, it, vi } from "vitest";
import {
  classifyLiveAvatarError,
  createLiveAvatarController,
  SDK_EVENTS,
  type LiveAvatarSessionLike,
  type LiveAvatarStage,
} from "@/lib/liveavatarClient";

class MockSession implements LiveAvatarSessionLike {
  handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  started = false;
  stopped = false;
  attachCalls = 0;
  maxSessionDuration: number | null = 120;
  constructor(
    public token: string,
    private startError?: Error,
    private hangStart = false,
  ) {}
  async start() {
    this.started = true;
    if (this.startError) {
      // The real SDK emits SESSION_DISCONNECTED (SESSION_START_FAILED) before rethrowing.
      this.emit(SDK_EVENTS.DISCONNECTED, "SESSION_START_FAILED");
      throw this.startError;
    }
    if (this.hangStart) await new Promise(() => {}); // never settles, like the SDK's websocket connect
  }
  async stop() {
    this.stopped = true;
  }
  attach() {
    this.attachCalls += 1;
  }
  on(event: string, cb: (...args: unknown[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), cb]);
  }
  emit(event: string, ...args: unknown[]) {
    (this.handlers.get(event) ?? []).forEach((cb) => cb(...args));
  }
}

function setup(opts: {
  startError?: Error;
  hangStart?: boolean;
  maxDurationSeconds?: number;
  startTimeoutMs?: number;
  streamTimeoutMs?: number;
} = {}) {
  const stages: LiveAvatarStage[] = [];
  const errors: unknown[] = [];
  const sessions: MockSession[] = [];
  const tokens: string[] = [];
  let n = 0;
  const video = {} as HTMLMediaElement;
  const controller = createLiveAvatarController({
    mintToken: async () => {
      const t = `token-${++n}`;
      tokens.push(t);
      return t;
    },
    createSession: (token) => {
      const s = new MockSession(token, opts.startError, opts.hangStart ?? false);
      sessions.push(s);
      return s;
    },
    videoEl: () => video,
    onStage: (s) => stages.push(s),
    onError: (e) => errors.push(e),
    maxDurationSeconds: opts.maxDurationSeconds,
    startTimeoutMs: opts.startTimeoutMs,
    streamTimeoutMs: opts.streamTimeoutMs,
  });
  return { controller, stages, errors, sessions, tokens };
}

describe("liveavatarClient controller", () => {
  it("attaches the video element only after SESSION_STREAM_READY, not right after start()", async () => {
    const { controller, sessions, stages } = setup();
    await controller.start();
    const s = sessions[0]!;
    expect(s.started).toBe(true);
    expect(s.attachCalls).toBe(0); // the old bug: blind attach right after start()
    expect(stages).toContain("token");
    expect(stages).toContain("webrtc");

    s.emit(SDK_EVENTS.STATE_CHANGED, "CONNECTED");
    expect(stages).toContain("stream");
    expect(s.attachCalls).toBe(0); // still no tracks

    s.emit(SDK_EVENTS.STREAM_READY);
    expect(s.attachCalls).toBe(1);
    expect(stages.at(-1)).toBe("connected");
  });

  it("classifies a WebRTC pc-connection failure as transport with network tips, and cleans up", async () => {
    const { controller, sessions, stages, errors } = setup({
      startError: new Error("could not establish pc connection"),
    });
    await controller.start();
    expect(sessions[0]!.stopped).toBe(true); // failed session is stopped/cleaned
    expect(stages.at(-1)).toBe("error");
    const err = errors[0] as ReturnType<typeof classifyLiveAvatarError>;
    expect(err.kind).toBe("transport");
    expect(err.tips.join(" ")).toContain("VPN");
    expect(err.tips.join(" ")).toContain("Wi");
  });

  it("classifies microphone denial distinctly from transport failures", async () => {
    const { controller, errors } = setup({
      startError: new DOMException("Permission denied", "NotAllowedError"),
    });
    await controller.start();
    const err = errors[0] as ReturnType<typeof classifyLiveAvatarError>;
    expect(err.kind).toBe("mic");
    expect(err.title).toContain("מיקרופון");
  });

  it("mints a fresh token on every attempt and never reuses one", async () => {
    const { controller, sessions, tokens } = setup();
    await controller.start();
    sessions[0]!.emit(SDK_EVENTS.DISCONNECTED, "SERVER_INITIATED");
    await vi.waitFor(() => expect(controller.isBusy()).toBe(false));
    await controller.start();
    expect(tokens).toEqual(["token-1", "token-2"]);
    expect(sessions[1]!.token).toBe("token-2");
  });

  it("ignores simultaneous start attempts (single-flight)", async () => {
    const { controller, tokens } = setup();
    await Promise.all([controller.start(), controller.start(), controller.start()]);
    expect(tokens).toHaveLength(1);
  });

  it("stop() stops the session and reports ended", async () => {
    const { controller, sessions, stages } = setup();
    await controller.start();
    await controller.stop();
    expect(sessions[0]!.stopped).toBe(true);
    expect(stages.at(-1)).toBe("ended");
    expect(controller.isBusy()).toBe(false);
  });

  it("teardown is idempotent and safe to call on unmount without a session", async () => {
    const { controller } = setup();
    await controller.teardown();
    await controller.teardown();
    expect(controller.isBusy()).toBe(false);
  });

  it("a SESSION_DISCONNECTED emitted during a failed start does not overwrite 'error' with 'ended'", async () => {
    const { controller, stages } = setup({
      startError: new Error("could not establish pc connection"),
    });
    await controller.start(); // mock emits DISCONNECTED before throwing, like the SDK
    expect(stages.at(-1)).toBe("error");
    expect(stages).not.toContain("ended");
  });

  it("stale callbacks from a previous session after a retry cannot change current status", async () => {
    const { controller, sessions, stages } = setup();
    await controller.start();
    const first = sessions[0]!;
    first.emit(SDK_EVENTS.STREAM_READY);
    expect(stages.at(-1)).toBe("connected");
    await controller.stop();
    await controller.start(); // retry with a fresh session
    const second = sessions[1]!;
    second.emit(SDK_EVENTS.STREAM_READY);
    expect(stages.at(-1)).toBe("connected");
    // Stale events from the first session must be ignored:
    first.emit(SDK_EVENTS.DISCONNECTED, "UNKNOWN_REASON");
    first.emit(SDK_EVENTS.STATE_CHANGED, "CONNECTED");
    first.emit(SDK_EVENTS.STREAM_READY);
    await new Promise((r) => setTimeout(r, 0));
    expect(stages.at(-1)).toBe("connected");
    expect(first.attachCalls).toBe(1); // never re-attached after going stale
  });

  it("error output never contains the session token", async () => {
    const { controller, errors, tokens } = setup({
      startError: new Error(`could not establish pc connection`),
    });
    await controller.start();
    expect(tokens[0]).toBeTruthy();
    expect(JSON.stringify(errors)).not.toContain(tokens[0]!);
  });

  it("times out a hanging start() instead of sticking on 'מתחבר' forever", async () => {
    const { controller, sessions, stages, errors } = setup({ hangStart: true, startTimeoutMs: 50 });
    await controller.start();
    expect(stages.at(-1)).toBe("error");
    expect(sessions[0]!.stopped).toBe(true); // hanging session is torn down
    const err = errors[0] as ReturnType<typeof classifyLiveAvatarError>;
    expect(err.kind).toBe("transport");
    expect(controller.isBusy()).toBe(false); // retry is possible
  });

  it("times out when the room connects but the avatar stream never arrives", async () => {
    vi.useFakeTimers();
    try {
      const { controller, sessions, stages, errors } = setup({ streamTimeoutMs: 100 });
      await controller.start();
      sessions[0]!.emit(SDK_EVENTS.STATE_CHANGED, "CONNECTED");
      expect(stages.at(-1)).toBe("stream");
      await vi.advanceTimersByTimeAsync(150);
      expect(stages.at(-1)).toBe("error");
      expect(sessions[0]!.stopped).toBe(true);
      expect((errors[0] as ReturnType<typeof classifyLiveAvatarError>).kind).toBe("transport");
    } finally {
      vi.useRealTimers();
    }
  });

  it("auto-stops shortly before the account session-duration cap", async () => {
    vi.useFakeTimers();
    try {
      const { controller, sessions, stages } = setup({ maxDurationSeconds: 120 });
      await controller.start();
      sessions[0]!.emit(SDK_EVENTS.STREAM_READY);
      expect(stages.at(-1)).toBe("connected");
      await vi.advanceTimersByTimeAsync(116_000);
      expect(sessions[0]!.stopped).toBe(true);
      expect(stages.at(-1)).toBe("ended");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("classifyLiveAvatarError", () => {
  it("never includes tokens or credentials in the output", () => {
    const secret = "sk-secret-token-123";
    const err = classifyLiveAvatarError(new Error(`failed with ${secret} could not establish pc connection`));
    expect(JSON.stringify(err)).not.toContain(secret);
  });

  it("treats 5xx API failures as server errors", () => {
    expect(classifyLiveAvatarError(new Error("SessionApiError: status 503")).kind).toBe("server");
  });

  it("falls back to unknown for unrecognized errors", () => {
    expect(classifyLiveAvatarError(new Error("something odd")).kind).toBe("unknown");
  });
});
