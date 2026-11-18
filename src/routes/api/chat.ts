import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { generateResponse } from "@lovable.dev/ai-gateway";
import { seedPatients } from "@/lib/fixtures";
import { buildSystemPrompt, extractOutputText, parseModelJson, safetyFirst } from "@/lib/chatCore";
import { visualGuidance } from "@/lib/faceSignals";
import { ACK_GUIDANCE } from "@/lib/quickAck";
import type { DemoAlert } from "@/lib/types";

const bodySchema = z.object({
  patientId: z.string().min(1).max(40),
  text: z.string().min(1).max(1000),
  // Bounded dialogue continuity: user/assistant only, never roles/permissions from the client.
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(500) }).strict())
    .max(8).optional().default([]),
  // Coarse on-device face cues (enums only — no images ever reach the server).
  visual: z.object({
    strain: z.enum(["normal", "high"]), fatigue: z.enum(["normal", "high"]), engagement: z.enum(["focused", "away"]),
  }).strict().optional(),
}).strict();

const uid = () => Math.random().toString(36).slice(2, 10);

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) return Response.json({ error: "invalid input" }, { status: 400 });

        // Demo data only: synthetic profiles from fixtures, never real PHI.
        const profile = seedPatients.find((p) => p.id === parsed.data.patientId);
        if (!profile) return Response.json({ error: "unknown demo patient" }, { status: 404 });
        const text = parsed.data.text;
        const at = new Date().toISOString();

        // 1. Safety first – deterministic, never reaches the model.
        const safety = safetyFirst(text);
        if (safety) {
          const alert: DemoAlert = {
            id: uid(), patientId: profile.id, priority: safety.priority, category: safety.category,
            createdAt: at, quote: text,
            why: `${safety.why} (מדיניות ${safety.id})`,
            uncertainty: "זיהוי דטרמיניסטי לפי ביטויים; ייתכן חיובי שגוי. נדרשת הערכה אנושית.",
            clinicianContext: profile.approvedNotes.join(" · "), targetRole: safety.targetRole, status: "open",
          };
          return Response.json({
            reply: safety.response,
            quickReplies: ["קראתי לאחות", "אני בטוח/ה"],
            rationale: { topic: "general", rule: `SAFETY-${safety.id}`, source: "safety-policy", technique: "ניתוב בטיחות דטרמיניסטי" },
            alert,
            source: "safety",
          });
        }

        // 2. Model call via AI Gateway – key stays server-side (LOVABLE_API_KEY).
        try {
          const res = await generateResponse({
            // Low reasoning effort: short conversational replies need low latency.
            model: "openai/gpt-6-astra",
            instructions: buildSystemPrompt(profile) + visualGuidance(parsed.data.visual) + ACK_GUIDANCE,
            input: [
              ...parsed.data.history.map((m) => ({ role: m.role, content: m.content })),
              { role: "user" as const, content: text },
            ],
            reasoning: { effort: "low" },
          });
          const parsed2 = parseModelJson(extractOutputText(res));
          if (!parsed2) throw new Error("model returned no usable JSON");
          return Response.json({
            reply: parsed2.reply,
            quickReplies: parsed2.quickReplies.length ? parsed2.quickReplies : ["טוב", "קשה לי", "איך אני מתקדם?"],
            rationale: {
              topic: profile.primaryTopic,
              rule: "SERVER-LLM",
              protocolId: profile.protocolIds[0],
              source: "server",
              technique: "תשובת מודל בהתאם לפרוטוקול – דמו",
            },
            source: "server",
          });
        } catch (err) {
          console.error("ai-chat failed:", err instanceof Error ? err.message : err);
          return Response.json({ error: "model unavailable" }, { status: 502 });
        }
      },
    },
  },
});
