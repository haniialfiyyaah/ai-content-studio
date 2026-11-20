# Architecture Decision Records

## ADR-001: Local-first infrastructure

- **Date:** 2026-03-19
- **Decision:** Use Supabase CLI + Docker Compose n8n for local development; keep env-driven config for future cloud deploy.
- **Why:** Matches approved plan (1A); no cloud credentials required to start.

## ADR-002: Refined creative-studio visual system

- **Date:** 2026-03-19
- **Decision:** Preserve UX v2.7 IA/flows; ship a refined studio aesthetic (expressive type, atmospheric surfaces) instead of the prototype lavender/Inter look.
- **Why:** Approved plan (2A); UX spec states visual design is not final.

## ADR-003: pnpm monorepo with workspace packages

- **Date:** 2026-03-19
- **Decision:** Follow TDD repo shape (`apps/web`, `apps/render-worker`, `packages/*`, `n8n/`, `supabase/`).
- **Why:** Clear ownership boundaries; domain logic shared by public/internal APIs.

## ADR-004: Fixture-first provider adapters

- **Date:** 2026-03-19
- **Decision:** Adapters support live + fixture modes; fixture mode is explicit and never reported as live success.
- **Why:** Enables full journey testing without paid credentials.

## ADR-005: Specs and design vendored under docs/

- **Date:** 2026-11-19
- **Decision:** Copy latest PRD/TDD/n8n/UX specs into `docs/specifications/` and keep v2.7 prototype + screenshots under `docs/design/`. Full 49-image archive stays in the external Master Package.
- **Why:** GitHub-portable documentation without bloating the repo with historical binaries; Master Package remains read-only.

## ADR-006: OpenAI only via Next.js AI Provider Gateway

- **Date:** 2026-11-19
- **Decision:** n8n workflows call `/api/internal/ai/*` over HTTP; no n8n OpenAI Chat Model credentials.
- **Why:** BYOK isolation, single policy enforcement, no key duplication in workflow execution data.

## ADR-007: BYOK decrypt only inside the gateway process

- **Date:** 2026-11-19
- **Decision:** `prepareOpenAiExecution` decrypts BYOK with `ACS_CREDENTIAL_ENCRYPTION_KEY` inside Next.js. n8n sends `ownerId` only — never plaintext keys. Fixture managed allowance exhaustion is skipped when `fixtureMode` is true (no spend).
- **Why:** Prevents key leakage into n8n execution data; keeps consent/billing invariants enforceable in one place.

## ADR-008: Supabase Cloud fallback when local disk is exhausted

- **Date:** 2026-11-19
- **Decision:** Prefer local Supabase CLI. If Docker/disk blocks local Postgres, create a cloud project via Supabase MCP or Dashboard, copy URL + anon + service_role into `apps/web/.env.local`, and apply migrations with the CLI against the linked project. No paid upgrades without explicit authorization. Do not commit project refs or secrets.
- **Why:** Unblocks auth/API verification without buying infra; keeps credentials out of git.

## ADR-009: Browser Remotion export for MVP; Sandbox later for unattended

- **Date:** 2026-11-20
- **Decision:** For user-initiated MVP video export, use Remotion Player + `@remotion/web-renderer` inside Next.js (aligned Remotion 4.0.544). Default `ACS_REMOTION_RENDER_BACKEND=browser`. Do **not** require `apps/render-worker`, Chromium, or FFmpeg locally. n8n WF-02 remains the orchestration contract; `/api/internal/render/remotion` marks `awaiting_browser_render` and must not complete without a verified MP4 upload. Intended future unattended path is **Vercel Sandbox** (adapter stub only — not provisioned, no billable runs without approval). Optional `legacy_worker` backend preserves the existing worker code.
- **Why:** Unblocks real MP4 export without a second deployable render service; keeps fal.ai / ElevenLabs / n8n roles intact; avoids claiming unattended automation is done with browser-only rendering.
- **Limitations:** Requires a compatible browser (WebCodecs); tab close interrupts the job; not suitable for headless/n8n-only production until Sandbox (or equivalent) is authorized and implemented.

## ADR-010: Demo media providers (fal LTX + ElevenLabs Flash)

- **Date:** 2026-11-20
- **Decision:** Default fal model `fal-ai/ltx-video` (~$0.02/video advisory) for cost-sensitive demos; quality alt `minimax/h3-max-turbo/text-to-video` (~$0.094/5s). Default ElevenLabs model `eleven_flash_v2_5`. Fixture mode uses Remotion CORS sample media so browser composition works without paid calls. Live spend requires explicit fixture flags off + keys + user authorization.
- **Why:** Capstone demo needs real composition wiring without forcing paid generation during development.

## ADR-011: Completion guard is mode-agnostic; hybrid fails honestly

- **Date:** 2026-11-20
- **Decision:** `completeVideoJob` refuses `ready_for_review` without a verified `outputAssetId` for **every** `production_mode`, not only `remotion`. WF-02's fal branch now submits then polls (bounded, 24 × 5s) until the provider reports completion, downloads the output, and persists a real `media_assets` row via `/api/internal/media/fal` before calling `jobs/complete`. The hybrid branch, which has no server-side compositor, now calls `jobs/fail` with `HYBRID_HEADLESS_NOT_IMPLEMENTED` instead of faking progress into `ready_for_review`.
- **Why:** fal.ai is asynchronous; WF-02 was calling `jobs/complete` immediately after `submit` with no asset, and the existing "don't fake success" guard only checked for `remotion`. Fal/hybrid jobs could reach `ready_for_review` — and be approved — with no rendered video at all.

## ADR-012: Telegram agent routes through existing intake, not a dead claim path

- **Date:** 2026-11-20
- **Decision:** WF-A2 now calls `/api/internal/telegram/intake` (dedupes the Telegram update, creates/reuses the conversation, appends the message, starts the planning run) and then launches **WF-A1** (not WF-A3 directly) as a sub-workflow with the resulting `{runId, conversationId, messageId, correlationId, ownerId}` — mirroring exactly what `/api/agent/messages` does for the web surface. WF-06's Telegram delivery node is now a real `n8n-nodes-base.telegram` `sendMessage` call using the notification's `chatId`, instead of a call to `/api/internal/jobs/progress` that only pretended to deliver.
- **Why:** WF-A2 previously called `/api/internal/jobs/claim` with `kind: "agent_run"`, a kind `jobs/claim` never handles (it only recognizes `"video"` and returns `not_claimable` for anything else) — so the "claim acquired?" branch was always false and Telegram messages from linked users never reached the agent at all. `/api/internal/telegram/intake` already existed, fully implemented, and was simply never wired into any workflow.

## ADR-013: Video production = durable queue row + webhook fast path + scheduled sweeper

- **Date:** 2026-11-20
- **Decision:** The `video_jobs` row (`status = queued`) is the source of truth. Render and regenerate wake WF-02 immediately via `dispatchVideoProduction` (`next/server` `after()`, 10s timeout) as a latency optimisation only. **WF-02S Video Queue Sweeper** runs every 2 minutes, asks `claim-due` (`kind: "video_jobs"`) for jobs still `queued` 2 min–24 h after their last update, and starts WF-02 once per job (Execute Workflow, `mode: each`, no wait). WF-02's `jobs/claim` (`queued → preparing` compare-and-set) guarantees a job runs once even when the webhook and sweeper race. WF-02 now acks the webhook on receipt; a non-acquired claim is a no-op. `failVideoJob` refuses to overwrite `ready_for_review`/`cancelled`/`failed`. The Remotion branch ends at `render/remotion`, which already completes or parks the job.
- **Why:** Dispatch was a single fire-and-forget `void fetch` (can be cut off on Vercel); nothing consumed `outbox_events`, no scheduler claimed `queued` video jobs, and regenerate never dispatched at all — a lost call left jobs `queued` forever. The old "claim not acquired → `jobs/fail`" branch would also have let a losing duplicate fail the winner's running job. The 24 h ceiling stops a backlog of old paid jobs from starting unexpectedly.

## ADR-014: v2.7 fresh rebuild — simplified flow, managed keys, queue-first

- **Date:** 2026-11-20
- **Decision:** Rebuild UI from the v2.7 prototype CSS and replace the schema with a lean one (projects, conversations/messages, generation_runs, contents with AI option sets, video_renders, publish_jobs, connected_accounts/oauth_tokens, analytics, research, activity, notifications, telegram_links). Remove spend approval/grants, consent, BYOK and manual text editing: users pick between AI-generated options and approve all at once. Studio manages OpenAI (n8n credential), fal, ElevenLabs and Google OAuth keys. Every unit of work is a DB row first; n8n webhooks are the fast path and WF-00 sweeps anything missed. Videos are one fal clip per storyboard scene composed with fal ffmpeg compose (+ optional narration) instead of template Remotion renders.
- **Why:** Owner direction: the old build diverged from the prototype and carried complexity (grants, outbox, BYOK, browser rendering) that blocked the core loop. Per-scene AI footage addresses "videos too simple"; queue-first + Realtime gives hands-off rendering with live UI.
