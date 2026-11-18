<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Staff screens live under `src/routes/_authenticated/` (client-only auth gate via `supabase.auth.getUser()`); staff permissions come from `public.user_roles` + `has_role()` RLS, never from client storage. Why: the demo self-grant must not become a privilege-escalation path.
- Synthetic demo data (alerts, station outcomes) is persisted in Lovable Cloud tables `demo_alerts`/`demo_outcomes` with staff-only RLS; the local `store.ts` state is a fallback/cache only. Why: staff data must survive devices while staying demo-only.
- The LiveAvatar custom-LLM bridge is `/api/liveavatar/v1/chat/completions` (OpenAI-compatible, SSE + non-stream), gated by `LIVEAVATAR_BRIDGE_SECRET` (fail-closed 503/401), with deterministic safety before any model call and pure logic in `src/lib/bridgeCore.ts`. Verified requests are recorded in `public.bridge_events` and drive the honest connection status on `/liveavatar`. Why: the avatar's brain must enforce the same clinical boundaries server-side, and "connected" may only reflect a real authorized request.
- Live avatar video uses Simli (`simli-client`, LiveKit default) via staff-only `src/lib/simli.functions.ts`; tokens are minted server-side with 60s/30s caps, paid sessions are refused until env `SIMLI_KEY_ROTATED=yes`, and lip-sync audio is server TTS converted to PCM16 16 kHz in `src/lib/simliCore.ts`. Why: LiveAvatar was dropped for cost, the first Simli key was exposed in chat, and Simli renders video only (no ASR/LLM/TTS). LiveAvatar code is kept but no longer used on the patient screen.
- Simli voice chat is half-duplex via pure `src/lib/voiceTurn.ts` (mic closed while Ori speaks, reopened after Simli "silent" + estimated PCM end; no barge-in); `/api/chat` accepts only strict bounded history (≤8 user/assistant, ≤500 chars). Why: prevents echo transcription and client-injected roles.
- Background on-device face analysis lives in pure src/lib/faceSignals.ts + hook useFaceSignals (MediaPipe, ~4fps, opt-in); only 3 enum cues reach /api/chat, never images. Why: privacy + cues shape tone only, never diagnosis.
