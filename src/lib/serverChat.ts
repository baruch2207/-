// Client helper for the /api/chat server route. The API key never leaves the server.
import type { DemoAlert, Rationale } from "./types";
import type { VisualContext } from "./faceSignals";

export interface ServerChatResult {
  reply: string;
  quickReplies: string[];
  rationale?: Rationale;
  alert?: DemoAlert;
  source: "server" | "safety";
}

export async function serverChat(
  patientId: string, text: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  visual?: VisualContext,
): Promise<ServerChatResult> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientId, text, history, ...(visual ? { visual } : {}) }),
  });
  if (!res.ok) throw new Error(`server chat failed: ${res.status}`);
  return (await res.json()) as ServerChatResult;
}
