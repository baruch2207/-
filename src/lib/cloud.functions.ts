import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AlertStatus, DemoAlert } from "./types";

// Server functions for the synthetic demo data stored in Lovable Cloud.
// Every function requires a signed-in user; staff-only data is further
// protected by RLS policies that check the 'staff' role in public.user_roles.

interface AlertRow {
  id: string;
  patient_id: string;
  priority: DemoAlert["priority"];
  category: DemoAlert["category"];
  created_at: string;
  quote: string;
  why: string;
  uncertainty: string;
  clinician_context: string;
  target_role: DemoAlert["targetRole"];
  status: DemoAlert["status"];
}

const rowToAlert = (r: AlertRow): DemoAlert => ({
  id: r.id,
  patientId: r.patient_id,
  priority: r.priority,
  category: r.category,
  createdAt: r.created_at,
  quote: r.quote,
  why: r.why,
  uncertainty: r.uncertainty,
  clinicianContext: r.clinician_context,
  targetRole: r.target_role,
  status: r.status,
});

/** Returns the signed-in user's roles and whether they have staff access. */
export const getStaffAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => r.role as string);
    return { isStaff: roles.includes("staff") || roles.includes("admin"), roles };
  });

/** Demo only: lets a signed-in user grant themselves the synthetic 'staff' role. */
export const grantDemoStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("user_roles")
      .insert({ user_id: context.userId, role: "staff" });
    // 23505 = duplicate key: the role already exists, which is fine.
    if (error && error.code !== "23505") throw new Error(error.message);
    return { ok: true as const };
  });

/** Lists synthetic demo alerts. RLS allows this only for staff role holders. */
export const listCloudAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("demo_alerts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => rowToAlert(r as AlertRow));
  });

/** Updates a demo alert's status. RLS allows this only for staff role holders. */
export const updateCloudAlertStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: AlertStatus }) => d)
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("demo_alerts")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * LiveAvatar bridge diagnostics for staff. Reports only metadata: whether the
 * server secret is configured and whether an authorized request has ever been
 * verified. Never exposes the secret value or any message content.
 */
export const getBridgeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(roleError.message);
    const isStaff = (roles ?? []).some((r) => r.role === "staff" || r.role === "admin");
    if (!isStaff) throw new Error("staff role required");

    const { data, error } = await context.supabase
      .from("bridge_events")
      .select("created_at")
      .eq("kind", "authorized_request")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);

    const { count } = await context.supabase
      .from("bridge_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "authorized_request");

    return {
      secretConfigured: Boolean(process.env["LIVEAVATAR_BRIDGE_SECRET"]),
      verified: (data?.length ?? 0) > 0,
      lastVerifiedAt: data?.[0]?.created_at ?? null,
      verifiedRequestCount: count ?? 0,
    };
  });

/**
 * Adds a bedside alert (help request / check-in / safety reply) to the cloud so staff on other
 * devices see it. RLS (migration 0003) allows this only for staff role holders and synthetic patients.
 */
export const recordCloudAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: DemoAlert) => {
    const ok = typeof d?.id === "string" && d.id.length <= 64 && /^p[1-6]$/.test(String(d.patientId))
      && ["critical", "high", "medium", "low"].includes(d.priority) && typeof d.quote === "string";
    if (!ok) throw new Error("invalid alert");
    const cut = (v: unknown, n: number) => String(v ?? "").slice(0, n);
    return { ...d, quote: cut(d.quote, 1000), why: cut(d.why, 500), uncertainty: cut(d.uncertainty, 500), clinicianContext: cut(d.clinicianContext, 1000) };
  })
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("demo_alerts").insert({
      id: data.id,
      patient_id: data.patientId,
      priority: data.priority,
      category: data.category,
      created_at: data.createdAt,
      quote: data.quote,
      why: data.why,
      uncertainty: data.uncertainty,
      clinician_context: data.clinicianContext,
      target_role: data.targetRole,
      status: "open",
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Records a synthetic station outcome. RLS allows this only for staff role holders. */
export const recordCloudOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { patientId: string; station: string; outcome: string }) => d)
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("demo_outcomes").insert({
      patient_id: data.patientId,
      station: data.station,
      outcome: data.outcome,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

async function requireStaff(context: { supabase: any; userId: string }) {
  const { data: roles, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const isStaff = (roles ?? []).some((r: { role: string }) => r.role === "staff" || r.role === "admin");
  if (!isStaff) throw new Error("staff role required");
}

/**
 * Staff-only: creates the LLM_API_KEY secret and LLM configuration in the
 * user's LiveAvatar account, server-to-server. Both secrets are read from
 * server env inside the handler and are never returned to the client.
 * Stores only the resulting resource IDs in public.bridge_config.
 */
export const provisionLiveAvatarBridge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { baseUrl: string; modelName: string }) => d)
  .handler(async ({ context, data }) => {
    await requireStaff(context);
    const apiKey = process.env["LIVEAVATAR_API_KEY"];
    const bridgeSecret = process.env["LIVEAVATAR_BRIDGE_SECRET"];
    if (!apiKey) return { ok: false as const, error: "LIVEAVATAR_API_KEY אינו מוגדר בשרת" };
    if (!bridgeSecret) return { ok: false as const, error: "LIVEAVATAR_BRIDGE_SECRET אינו מוגדר בשרת" };

    const { provisionLiveAvatar } = await import("./liveavatarAdmin");
    const result = await provisionLiveAvatar(apiKey, bridgeSecret, {
      baseUrl: data.baseUrl,
      modelName: data.modelName,
    });
    if (!result.ok) return { ok: false as const, error: result.error };

    const { error } = await context.supabase.from("bridge_config").upsert({
      id: true,
      llm_secret_id: result.result.llmSecretId,
      llm_configuration_id: result.result.llmConfigurationId,
      base_url: result.result.baseUrl,
      model_name: result.result.modelName,
      provisioned_at: new Date().toISOString(),
      provisioned_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, config: result.result };
  });

/** Staff-only: returns the stored LiveAvatar provisioning metadata (IDs only). */
export const getLiveAvatarConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { data, error } = await context.supabase
      .from("bridge_config")
      .select("llm_secret_id, llm_configuration_id, base_url, model_name, provisioned_at")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      apiKeyConfigured: Boolean(process.env["LIVEAVATAR_API_KEY"]),
      config: data
        ? {
            llmSecretId: data.llm_secret_id as string,
            llmConfigurationId: data.llm_configuration_id as string,
            baseUrl: data.base_url as string,
            modelName: data.model_name as string,
            provisionedAt: data.provisioned_at as string,
          }
        : null,
    };
  });

/**
 * Public (patient screen has no login): mints a short-lived FULL-mode session
 * token wired to our custom-LLM bridge. The account API key stays server-side;
 * only the scoped session token is returned. Avatar/voice/context come from
 * env overrides or the first resource of each kind in the account.
 */
export const createLiveAvatarSession = createServerFn({ method: "POST" })
  .handler(async () => {
    const apiKey = process.env["LIVEAVATAR_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "חיבור LiveAvatar אינו מוגדר בשרת" };

    // Privileged reads/writes (bridge_config and bridge_events are staff-only
    // under RLS), so this public endpoint uses the admin client server-side.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg, error: cfgError } = await supabaseAdmin
      .from("bridge_config")
      .select("llm_configuration_id")
      .eq("id", true)
      .maybeSingle();
    if (cfgError) throw new Error(cfgError.message);
    if (!cfg) return { ok: false as const, error: "תצורת ה־LLM טרם נוצרה (ראו מסך חיבור LiveAvatar)" };

    const { firstResourceId, ensureContext, createFullSessionToken } = await import("./liveavatarAdmin");
    const avatarId =
      process.env["LIVEAVATAR_AVATAR_ID"] ??
      (await firstResourceId(apiKey, "/avatars")).id ??
      (await firstResourceId(apiKey, "/avatars/public")).id;
    const voiceId =
      process.env["LIVEAVATAR_VOICE_ID"] ?? (await firstResourceId(apiKey, "/voices")).id;
    const contextId =
      process.env["LIVEAVATAR_CONTEXT_ID"] ?? (await ensureContext(apiKey)).id;
    if (!avatarId || !voiceId || !contextId) {
      return { ok: false as const, error: "חסרים avatar/voice/context בחשבון LiveAvatar" };
    }

    const created = await createFullSessionToken(apiKey, {
      avatarId,
      voiceId,
      contextId,
      llmConfigurationId: cfg.llm_configuration_id as string,
      language: "he",
      maxSessionDurationSeconds: 120,
    });
    if (!created.ok) return { ok: false as const, error: created.error };

    // Metadata only: records that a real FULL session token was minted.
    await supabaseAdmin.from("bridge_events").insert({ kind: "session_token_created" });
    return { ok: true as const, session: created.result };
  });

/** Staff-only diagnostics: which LiveAvatar resources exist in the account. */
export const diagnoseLiveAvatarResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const apiKey = process.env["LIVEAVATAR_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "LIVEAVATAR_API_KEY אינו מוגדר בשרת" };
    const { diagnoseResources } = await import("./liveavatarAdmin");
    return { ok: true as const, resources: await diagnoseResources(apiKey) };
  });
