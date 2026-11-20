# Requirements traceability

Maps PRD/TDD capabilities to **implementation status** and **verification evidence**.  
Status vocabulary:

| Label | Meaning |
|---|---|
| **Verified** | Implemented and exercised successfully in local smoke/unit tests |
| **Implemented** | Code present; not fully E2E-verified live |
| **Fixture** | Works via deterministic adapters; not live provider |
| **Partial** | Screen/API exists but incomplete vs spec |
| **Blocked** | Waiting on credentials, infra, or unfinished dependency |
| **Not started** | Not meaningfully present |

## Core journey (PRD acceptance)

| Requirement | Status | Evidence |
|---|---|---|
| Sign-in → Studio home | **Verified** | API smoke 2026-11-19; `/login`, `/`. Since 2026-11-20 `/` is the conversation-first Studio home, which replaces the Overview. |
| First actionable message → Draft Project | **Verified** (fixture AI via gateway) | `POST /api/agent/messages` → `prepareOpenAiExecution` + `executeOpenAi` |
| Agent → n8n → gateway live LLM | **Verified** (fixture AI) | WF-A1/A3 imported; executions success; draft project + `runStatus:completed`; live LLM still needs keys |
| Secure BYOK execute (decrypt in-process) | **Verified** (fixture) | Store → test → mode byok → `/api/internal/ai/execute` `mode:"byok"`; never accepts plaintext BYOK from n8n |
| Unified Project Detail by status | **Partial** | Same tabs for every status. Content, automation, publishing, assets, and activity read persisted rows. Initial launch selection saves while draft. Shell color and navigation follow v2.7; individual layouts are still thinner than the prototype. |
| Concept Approve / Edit (immutable versions) | **Implemented** | Approve API, script editor saves a new draft, empty drafts can be filled and labeled as fixture. |
| Video Approve / Regenerate | **Implemented** | Review screen and Content → Production call approve, revoke, and regenerate. Approve succeeds only at `ready_for_review`. |
| Initial launch ≠ approval; activation gate | **Verified** | `INITIAL_LAUNCH_NOT_READY` then activate OK |
| Activate ≠ paid render ≠ publish | **Verified** | Activate succeeded without auto-render; render needs grant |
| Creator authorizes spend from the UI | **Implemented** | `AuthorizeSpendButton` on the Studio home decision card and Content → Production posts a `produce_paid_media` grant ($5, 30 days) after an explicit confirm. Not yet clicked through live. |
| Consent gates visible per concept | **Implemented** | `deriveConsentTrack` (Concept, Spend, Video, Publish) from persisted rows; shown on the Studio home and Content Detail. Home confirmed by screenshot; Content Detail and mobile not yet. |
| Video Remotion / fal / Hybrid | **Partial** | Browser Remotion + media prepare **Implemented** (fal LTX + ElevenLabs Flash into composition; fixture CORS samples). Storage upload smoke **Verified**. Chrome encode manual. WF-02 voice→`/api/internal/media/elevenlabs`, fal→`fal-ai/ltx-video` with real poll-until-complete + persisted asset (2026-11-20) — `completeVideoJob` now refuses `ready_for_review` for **every** mode without a verified `outputAssetId`, not just remotion. Hybrid headless has no compositor — WF-02 fails it explicitly instead of faking completion; browser export's "include footage and narration" toggle is the only working hybrid-equivalent path today. Sandbox unattended **Not started** |
| Publishing calendar + schedule form | **Implemented** | UI + `publishing_jobs` API; live OAuth **Blocked** |
| BYOK no silent managed fallback | **Verified** | Unit policy + fixture BYOK execute decrypt; invalid/missing key → `BYOK_KEY_INVALID` |
| Telegram continuity | **Partial** | WF-A2 rewired (2026-11-20) to call the previously-unused `/api/internal/telegram/intake` → launch WF-A1, replacing a `jobs/claim(kind:"agent_run")` call that always returned `not_claimable` (Telegram messages never reached the agent at all). WF-06 now sends real Telegram messages via `n8n-nodes-base.telegram` instead of just pinging a progress endpoint and marking itself "delivered". Still **Blocked**: bot token known to this session but not yet applied as an n8n credential (needs `n8n-mcp`/claude.ai n8n MCP auth — pending), and the workflows are not yet pushed to the cloud instance. |
| n8n all 11 workflows | **Implemented** | All 13 repo workflows are on the cloud account and published; WF-02S (queue sweeper) added 2026-11-20, unpublished pending app deploy. |

## Functional requirements (selected)

| ID | Topic | Status |
|---|---|---|
| FR-01 | Auth / accounts | **Verified** |
| FR-02 | Shared AI agent | **Partial** (fixture / gateway path) |
| FR-03 | Agent-driven project creation | **Verified** (fixture) |
| FR-04 | Project lifecycle | **Verified** (activate/pause APIs) |
| FR-05 | Creative Kit | **Implemented** |
| FR-06–08 | Concepts / collaboration / visual plan | **Partial** |
| FR-09 | Assets | **Partial** (library list / upload-intent TBD) |
| FR-10–11 | Video / narration | **Partial** (browser Remotion export Implemented; narration/fal Fixture) |
| FR-12–13 | Concept/video review | **Verified** / **Partial** |
| FR-14–16 | Automation / ideation / production gates | **Partial** |
| FR-17–18 | Publishing / OAuth | **Partial** / **Blocked** |
| FR-19 | Telegram | **Blocked** |
| FR-24 | Monitoring / cost / notifications | **Partial** |
| FR-25 | Managed OpenAI + BYOK | **Partial** (fixture BYOK execute **Verified**; live provider calls need real keys) |

## n8n workflows

| ID | Status |
|---|---|
| WF-A1 Web Agent Gateway | **Verified** (fixture E2E) |
| WF-A2 Telegram Gateway | JSON **Implemented** — now routes through intake → WF-A1 instead of a dead claim path (2026-11-20); Telegram credential **Blocked** |
| WF-A3 Shared Creative Agent | **Verified** (sub-workflow via A1; fixture AI) |
| WF-01 Ideation | JSON **Implemented** |
| WF-02 Video Production | **Published** on cloud — fal branch polls to real completion and persists an asset before claiming done; hybrid fails honestly; webhook acks on receipt; lost claim is a no-op (2026-11-20) |
| WF-02S Video Queue Sweeper | **Implemented**, on cloud **unpublished** until the app with `claim-due` `video_jobs` is deployed — every 2 min re-dispatches `queued` jobs the webhook missed (ADR-013) |
| WF-03 Publishing | JSON **Implemented** |
| WF-04 Error / Recovery | JSON **Implemented** |
| WF-05 Research | JSON **Implemented** |
| WF-06 Notifications | JSON **Implemented** — Telegram channel now sends via a real `n8n-nodes-base.telegram` node (2026-11-20); email/in-app remain progress-only stubs |
| WF-07 Analytics | JSON **Implemented** (Phase 4 lean) |
| WF-08 Reconciliation | JSON **Implemented** |

## Automated tests

| Suite | Status |
|---|---|
| Domain unit (`@acs/domain`) | **Verified** — 15 tests |
| Integrations unit (`@acs/integrations`) | **Verified** — 4 tests |
| Playwright E2E | **Partial** — `@playwright/test` + smoke spec; Chromium install blocked in agent sandbox (`pnpm exec playwright install`); login UI checked via browser |
| n8n import helper | **Implemented** — `scripts/import-n8n-workflows.mjs` / `pnpm n8n:import` (needs API key) |

## Spec documents in-repo

| Doc | Path |
|---|---|
| PRD v2.2 | [specifications/PRD.md](specifications/PRD.md) |
| TDD v2.2 | [specifications/TDD.md](specifications/TDD.md) |
| n8n Spec v1.1 | [specifications/N8N_WORKFLOWS.md](specifications/N8N_WORKFLOWS.md) |
| UX Spec v2.7 | [specifications/UX_SPECIFICATION.md](specifications/UX_SPECIFICATION.md) |
