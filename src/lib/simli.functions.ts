import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Simli server functions — STAFF ONLY. No public token minting.
// The Simli API key is read only inside handlers and never returned.

async function assertStaff(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((r: { role: string }) => r.role === "staff" || r.role === "admin")) {
    throw new Error("staff role required");
  }
}

/** Status only: booleans, never values. Makes NO request to Simli. */
export const getSimliStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { resolveFaceId, resolveSimliCaps } = await import("./simliCore");
    const face = resolveFaceId(process.env["SIMLI_FACE_ID"]);
    return {
      apiKeyConfigured: Boolean(process.env["SIMLI_API_KEY"]),
      // Set only after the exposed key is replaced through the secure form.
      rotationConfirmed: process.env["SIMLI_KEY_ROTATED"] === "yes",
      faceIdConfigured: !face.isDemoFace,
      isDemoFace: face.isDemoFace,
      asr: "browser-webspeech" as const,
      ai: "server-/api/chat" as const,
      tts: "server-gateway" as const,
      patientCaps: resolveSimliCaps("patient", process.env),
    };
  });

/**
 * Mints ONE short-lived Simli session token. Billable — explicit staff action only.
 * mode "test": 60s / 30s idle (staff test page). mode "patient": bedside tablet that a
 * signed-in staff member handed to a patient; capped server-side (default 300s / 60s idle, hard max 600s).
 */
export const createSimliSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { acknowledgeBilling: boolean; mode?: "test" | "patient" }) => ({
    acknowledgeBilling: d?.acknowledgeBilling === true,
    mode: d?.mode === "patient" ? ("patient" as const) : ("test" as const),
  }))
  .handler(async ({ context, data }) => {
    await assertStaff(context);
    if (data.acknowledgeBilling !== true) return { ok: false as const, error: "billing not acknowledged" };
    if (process.env["SIMLI_KEY_ROTATED"] !== "yes") return { ok: false as const, error: "key rotation required" };
    const apiKey = process.env["SIMLI_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "api key missing (401)" };

    const { resolveFaceId, buildSimliTokenConfig, resolveSimliCaps } = await import("./simliCore");
    const face = resolveFaceId(process.env["SIMLI_FACE_ID"]);
    const caps = resolveSimliCaps(data.mode, process.env);
    const res = await fetch("https://api.simli.ai/compose/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-simli-api-key": apiKey },
      body: JSON.stringify(buildSimliTokenConfig(face.faceId, caps)),
    });
    if (!res.ok) {
      // Status code only; the response body may echo request details.
      const kind = res.status === 401 || res.status === 403 ? "unauthorized" : res.status === 404 || res.status === 422 ? "face id rejected" : "token failed";
      return { ok: false as const, error: `${kind} (${res.status})` };
    }
    const json = (await res.json()) as { session_token?: string };
    if (!json.session_token) return { ok: false as const, error: "token missing in response" };
    return { ok: true as const, sessionToken: json.session_token, isDemoFace: face.isDemoFace, maxSeconds: caps.maxSessionLength, idleSeconds: caps.maxIdleTime };
  });

/** Server TTS via Lovable AI → mono 16 kHz PCM16 (base64) for Simli lip-sync. Staff only. */
export const synthesizeSimliSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string }) => {
    const text = String(d?.text ?? "").trim().slice(0, 600);
    if (!text) throw new Error("empty text");
    return { text };
  })
  .handler(async ({ context, data }) => {
    await assertStaff(context);
    const { generateSpeech } = await import("@lovable.dev/ai-gateway");
    const { parseWav, toPcm16Mono16k } = await import("./simliCore");
    try {
      const r = await generateSpeech({
        model: "google/gemini-3.1-flash-tts-preview",
        contents: [{ role: "user", parts: [{ text: `Read aloud in warm, slow, clear Hebrew: ${data.text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } },
        },
      } as Parameters<typeof generateSpeech>[0]);
      const bytes = new Uint8Array(await (await r.blob()).arrayBuffer());
      const pcm = toPcm16Mono16k(parseWav(bytes));
      let bin = "";
      for (let i = 0; i < pcm.length; i += 0x8000) bin += String.fromCharCode(...pcm.subarray(i, i + 0x8000));
      return { ok: true as const, pcmBase64: btoa(bin), seconds: pcm.length / 2 / 16000 };
    } catch {
      return { ok: false as const, error: "tts failed" };
    }
  });
