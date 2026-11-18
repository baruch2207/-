// Server-side helpers for provisioning the LiveAvatar custom-LLM integration.
// These call the LiveAvatar Management API with the account API key, which must
// only ever live in server env (LIVEAVATAR_API_KEY). Nothing here may run in
// the browser, and secret values are never logged or returned to the client.

export const LIVEAVATAR_API_BASE = "https://api.liveavatar.com/v1";

export interface ProvisionInput {
  baseUrl: string;
  modelName: string;
}

export interface ProvisionResult {
  llmSecretId: string;
  llmConfigurationId: string;
  baseUrl: string;
  modelName: string;
}

/** Validates the provisioning inputs before any external call is made. */
export function validateProvisionInput(input: ProvisionInput): string | null {
  const { baseUrl, modelName } = input;
  if (typeof baseUrl !== "string" || baseUrl.length === 0 || baseUrl.length > 300) {
    return "base_url חסר או ארוך מדי";
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return "base_url אינו כתובת תקינה";
  }
  if (parsed.protocol !== "https:") return "base_url חייב להתחיל ב־https";
  if (typeof modelName !== "string" || !/^[a-zA-Z0-9._/-]{1,120}$/.test(modelName)) {
    return "model_name חסר או מכיל תווים לא חוקיים";
  }
  return null;
}

interface LiveAvatarListData {
  id?: string;
  secret_id?: string;
  llm_configuration_id?: string;
}

async function liveavatarPost(
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: LiveAvatarListData | null; message: string }> {
  let res: Response;
  try {
    res = await fetch(`${LIVEAVATAR_API_BASE}${path}`, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, status: 0, data: null, message: "לא ניתן להגיע ל־LiveAvatar (רשת/timeout)" };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const parsed = (json ?? {}) as { code?: number; message?: string; data?: LiveAvatarListData };
  const message = typeof parsed.message === "string" ? parsed.message : `HTTP ${res.status}`;
  return { ok: res.ok, status: res.status, data: parsed.data ?? null, message };
}

/**
 * Creates the LLM_API_KEY secret and the LLM configuration in the user's
 * LiveAvatar account. The bridge secret value is sent only to LiveAvatar's
 * encrypted secret store; it is never returned or logged.
 */
export async function provisionLiveAvatar(
  apiKey: string,
  bridgeSecret: string,
  input: ProvisionInput,
): Promise<{ ok: true; result: ProvisionResult } | { ok: false; error: string }> {
  const invalid = validateProvisionInput(input);
  if (invalid) return { ok: false, error: invalid };

  // LiveAvatar's API accepts OPENAI_API_KEY as the secret type for any
  // OpenAI-compatible custom LLM endpoint (LLM_API_KEY is not a valid enum).
  const secretRes = await liveavatarPost(apiKey, "/secrets", {
    secret_type: "OPENAI_API_KEY",
    secret_name: "Byachad Rehab Bridge",
    secret_value: bridgeSecret,
  });
  const secretId = secretRes.data?.secret_id ?? secretRes.data?.id;
  if (!secretRes.ok || !secretId) {
    return { ok: false, error: `יצירת ה־secret ב־LiveAvatar נכשלה: ${secretRes.message}` };
  }

  const configRes = await liveavatarPost(apiKey, "/llm-configurations", {
    display_name: "Byachad Rehab Protocol Bridge",
    model_name: input.modelName,
    secret_id: secretId,
    base_url: input.baseUrl,
  });
  const configId = configRes.data?.llm_configuration_id ?? configRes.data?.id;
  if (!configRes.ok || !configId) {
    return { ok: false, error: `יצירת תצורת ה־LLM ב־LiveAvatar נכשלה: ${configRes.message}` };
  }

  return {
    ok: true,
    result: {
      llmSecretId: secretId,
      llmConfigurationId: configId,
      baseUrl: input.baseUrl,
      modelName: input.modelName,
    },
  };
}

interface LiveAvatarGetResult {
  ok: boolean;
  status: number;
  results: Array<Record<string, unknown>>;
  message: string;
}

async function liveavatarGet(apiKey: string, path: string): Promise<LiveAvatarGetResult> {
  let res: Response;
  try {
    res = await fetch(`${LIVEAVATAR_API_BASE}${path}`, {
      headers: { "X-API-KEY": apiKey },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, status: 0, results: [], message: "לא ניתן להגיע ל־LiveAvatar (רשת/timeout)" };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const parsed = (json ?? {}) as { message?: string; data?: { results?: Array<Record<string, unknown>> } };
  return {
    ok: res.ok,
    status: res.status,
    results: parsed.data?.results ?? [],
    message: typeof parsed.message === "string" ? parsed.message : `HTTP ${res.status}`,
  };
}

/** Returns the first id from a LiveAvatar list endpoint, or null. */
export async function firstResourceId(
  apiKey: string,
  path: "/avatars" | "/avatars/public" | "/voices" | "/contexts",
): Promise<{ id: string | null; error: string | null }> {
  const res = await liveavatarGet(apiKey, path);
  if (!res.ok) return { id: null, error: `שליפת ${path} נכשלה: ${res.message}` };
  const first = res.results[0];
  const id = first && typeof first["id"] === "string" ? (first["id"] as string) : null;
  if (!id) return { id: null, error: `לא נמצא אף משאב ב־${path} בחשבון` };
  return { id, error: null };
}

/**
 * Returns an existing context id, or creates a minimal Hebrew companion
 * context. The clinical rules live in our bridge's system prompt — this
 * context stays intentionally thin so the bridge remains the brain.
 */
export async function ensureContext(apiKey: string): Promise<{ id: string | null; error: string | null }> {
  const existing = await firstResourceId(apiKey, "/contexts");
  if (existing.id) return existing;
  const res = await liveavatarPost(apiKey, "/contexts", {
    name: "Byachad Rehab Companion",
    prompt:
      "You are Ori, a warm Hebrew-speaking rehab companion for geriatric inpatients. " +
      "All clinical rules, safety boundaries and response style come from the connected " +
      "custom LLM endpoint; follow its instructions exactly. Speak short, gentle Hebrew. " +
      "Never give medical advice or new exercises. Demo with synthetic data only.",
    opening_text: "שלום, אני אורי. נעים לראות אותך. איך אתה מרגיש היום?",
  });
  const data = res.data as { id?: string; context_id?: string } | null;
  const id = data?.context_id ?? data?.id ?? null;
  if (!res.ok || !id) return { id: null, error: `יצירת context נכשלה: ${res.message}` };
  return { id, error: null };
}

/** Staff diagnostics: raw list-endpoint status and item counts (no secrets). */
export async function diagnoseResources(apiKey: string) {
  const out: Record<string, { ok: boolean; status: number; count: number; message: string }> = {};
  for (const path of ["/avatars", "/avatars/public", "/voices", "/contexts"] as const) {
    const res = await liveavatarGet(apiKey, path);
    out[path] = { ok: res.ok, status: res.status, count: res.results.length, message: res.message };
  }
  return out;
}

export interface FullSessionResult {
  sessionId: string;
  sessionToken: string;
}

/**
 * Creates a FULL-mode session token wired to our custom LLM configuration.
 * The returned token is short-lived and scoped to this session only; the
 * account API key never leaves the server.
 */
export async function createFullSessionToken(
  apiKey: string,
  params: {
    avatarId: string;
    voiceId: string;
    contextId: string;
    llmConfigurationId: string;
    language?: string;
    maxSessionDurationSeconds?: number;
  },
): Promise<{ ok: true; result: FullSessionResult } | { ok: false; error: string }> {
  const res = await liveavatarPost(apiKey, "/sessions/token", {
    mode: "FULL",
    avatar_id: params.avatarId,
    llm_configuration_id: params.llmConfigurationId,
    max_session_duration: params.maxSessionDurationSeconds ?? 600,
    avatar_persona: {
      voice_id: params.voiceId,
      context_id: params.contextId,
      language: params.language ?? "he",
    },
  });
  const data = res.data as { session_id?: string; session_token?: string } | null;
  const sessionId = data?.session_id;
  const sessionToken = data?.session_token;
  if (!res.ok || !sessionId || !sessionToken) {
    return { ok: false, error: `יצירת טוקן הסשן נכשלה: ${res.message}` };
  }
  return { ok: true, result: { sessionId, sessionToken } };
}
