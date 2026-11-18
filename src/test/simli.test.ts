import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  SIMLI_DEMO_FACE_ID, buildSimliTokenConfig, canStartPaidSession, chunkPcm, classifySimliError,
  parseWav, resolveFaceId, toPcm16Mono16k, billableMinutes,
} from "@/lib/simliCore";

function wav(rate: number, channels: number, samples: number[]): Uint8Array {
  const data = samples.length * 2;
  const b = new Uint8Array(44 + data);
  const dv = new DataView(b.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  w(0, "RIFF"); dv.setUint32(4, 36 + data, true); w(8, "WAVE"); w(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, channels, true);
  dv.setUint32(24, rate, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, data, true);
  samples.forEach((v, i) => dv.setInt16(44 + i * 2, v, true));
  return b;
}

describe("simli cost caps", () => {
  it("token config caps session at 60s and idle at 30s", () => {
    const c = buildSimliTokenConfig("x");
    expect(c.maxSessionLength).toBe(60);
    expect(c.maxIdleTime).toBe(30);
  });
  it("paid session blocked until key rotated and billing acknowledged", () => {
    const base = { apiKeyConfigured: true, rotationConfirmed: false, faceIdConfigured: false, ttsAvailable: true };
    expect(canStartPaidSession(base, true)).toBe(false);
    expect(canStartPaidSession({ ...base, rotationConfirmed: true }, false)).toBe(false);
    expect(canStartPaidSession({ ...base, rotationConfirmed: true }, true)).toBe(true);
  });
  it("rounds billable minutes up", () => {
    expect(billableMinutes(61)).toBe(2);
    expect(billableMinutes(0)).toBe(0);
  });
});

describe("face id", () => {
  it("falls back to labeled demo face when unset or invalid", () => {
    expect(resolveFaceId(undefined)).toEqual({ faceId: SIMLI_DEMO_FACE_ID, isDemoFace: true });
    expect(resolveFaceId("bad").isDemoFace).toBe(true);
  });
});

describe("audio pipeline", () => {
  it("converts 24k stereo WAV to 16k mono PCM16", () => {
    const pcm = toPcm16Mono16k(parseWav(wav(24000, 2, new Array(2400 * 2).fill(1000))));
    expect(pcm.length).toBe(1600 * 2);
    expect(new DataView(pcm.buffer).getInt16(0, true)).toBe(1000);
    expect(chunkPcm(pcm, 1000).length).toBe(4);
  });
});

describe("errors", () => {
  it("classifies in Hebrew without echoing raw detail", () => {
    expect(classifySimliError(new Error("unauthorized (401) sk_secret")).kind).toBe("auth");
    expect(classifySimliError("webrtc ice failed").kind).toBe("webrtc");
    expect(classifySimliError(new Error("NotAllowedError")).kind).toBe("mic");
    expect(classifySimliError("key rotation required").kind).toBe("rotation");
    expect(JSON.stringify(classifySimliError(new Error("unauthorized sk_secret")))).not.toContain("sk_secret");
  });
});

describe("no browser API key", () => {
  it("SIMLI_API_KEY only appears in server function handlers", () => {
    const hits: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach((f) => {
      const p = join(d, f);
      if (statSync(p).isDirectory()) return walk(p);
      if (/\.(ts|tsx)$/.test(f) && readFileSync(p, "utf8").includes("SIMLI_API_KEY")) hits.push(p);
    });
    walk("src/components"); walk("src/routes");
    expect(hits).toEqual([]);
  });
});
