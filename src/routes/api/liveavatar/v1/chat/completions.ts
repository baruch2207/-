import { createFileRoute } from "@tanstack/react-router";
import { generateResponse } from "@lovable.dev/ai-gateway";
import {
  BRIDGE_MODEL,
  MAX_BODY_BYTES,
  buildBridgeSystemPrompt,
  fallbackReply,
  lastUserText,
  matchProtocols,
  replyToSseStream,
  safetyGate,
  selectDemoPatient,
  toChatCompletion,
  validateBridgeBody,
} from "@/lib/bridgeCore";
import { extractOutputText } from "@/lib/chatCore";

// OpenAI-compatible custom-LLM endpoint for LiveAvatar FULL mode.
// Server-to-server only: no CORS headers are emitted, and the bearer secret
// (LIVEAVATAR_BRIDGE_SECRET) lives exclusively in server env. Message content
// is never logged – only metadata.

const jsonError = (status: number, message: string, type = "invalid_request_error") =>
  Response.json({ error: { message, type, code: null, param: null } }, { status });

/** Constant-time-ish comparison: hash both sides, then compare bytes. */
async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i]! ^ vb[i]!;
  return diff === 0;
}

// Best-effort per-worker rate limit. Workers are stateless, so this is NOT a
// durable global limit – it only throttles bursts hitting the same instance.
const buckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per minute per caller key, per worker instance
function rateLimited(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  b.count += 1;
  return b.count > RATE_LIMIT;
}

/** Records that an authorized request reached the bridge (drives the honest "connected" status). */
async function recordVerifiedRequest(): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("bridge_events").insert({ kind: "authorized_request" });
  } catch {
    // Status bookkeeping must never break the bridge itself.
  }
}

export const Route = createFileRoute("/api/liveavatar/v1/chat/completions")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204 }),

      POST: async ({ request }) => {
        // 1. Fail closed when the bridge secret is not configured server-side.
        const secret = process.env["LIVEAVATAR_BRIDGE_SECRET"];
        if (!secret) return jsonError(503, "bridge not configured", "server_configuration_error");

        // 2. Bearer auth, constant-time compared.
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token || !(await secretMatches(token, secret))) {
          return jsonError(401, "invalid or missing bearer token", "authentication_error");
        }

        // 3. Best-effort rate limit (per worker instance).
        const callerKey = request.headers.get("cf-connecting-ip") ?? "liveavatar";
        if (rateLimited(callerKey)) return jsonError(429, "rate limit exceeded", "rate_limit_error");

        // 4. Hard size cap before parsing.
        const contentLength = Number(request.headers.get("content-length") ?? "0");
        if (contentLength > MAX_BODY_BYTES) return jsonError(413, "request too large");

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonError(400, "invalid JSON body");
        }
        const body = validateBridgeBody(raw);
        if (!body) return jsonError(400, "invalid chat completion request");

        // 5. Synthetic demo patient context only – never arbitrary patient data.
        const profile = selectDemoPatient(body.messages);
        const utterance = lastUserText(body.messages);

        // 6. Deterministic safety gate BEFORE any model call.
        const safety = safetyGate(utterance);
        let reply: string;
        if (safety) {
          reply = safety.response;
        } else {
          // 7. Model call with the full six-protocol registry; safe fallback on failure.
          const active = matchProtocols(utterance, profile);
          const transcript = body.messages
            .filter((m) => m.role !== "system")
            .map((m) => `${m.role === "user" ? "מטופל" : "אורי"}: ${m.content}`)
            .join("\n");
          try {
            const res = await generateResponse({
              model: BRIDGE_MODEL,
              instructions: buildBridgeSystemPrompt(profile, active),
              input: transcript,
            });
            const text = extractOutputText(res).trim();
            reply = text || fallbackReply();
          } catch (err) {
            console.error("liveavatar bridge model call failed:", err instanceof Error ? err.message : err);
            reply = fallbackReply();
          }
        }

        // 8. Honest connection bookkeeping (metadata only, never content).
        void recordVerifiedRequest();

        // 9. OpenAI-compatible response: SSE stream or plain JSON.
        if (body.stream) {
          return new Response(replyToSseStream(reply, body.model), {
            status: 200,
            headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
          });
        }
        return Response.json(toChatCompletion(reply, body.model));
      },
    },
  },
});
