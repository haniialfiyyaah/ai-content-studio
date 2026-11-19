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
| Sign-in → Overview | **Verified** | API smoke 2026-11-19; `/login`, `/` |
| First actionable message → Draft Project | **Verified** (fixture AI via gateway) | `POST /api/agent/messages` → `prepareOpenAiExecution` + `executeOpenAi` |
| Agent → n8n → gateway live LLM | **Verified** (fixture AI) | WF-A1/A3 imported; executions success; draft project + `runStatus:completed`; live LLM still needs keys |
| Secure BYOK execute (decrypt in-process) | **Verified** (fixture) | Store → test → mode byok → `/api/internal/ai/execute` `mode:"byok"`; never accepts plaintext BYOK from n8n |
| Unified Project Detail by status | **Implemented** | `/projects/[id]` tabs + lifecycle actions |
| Concept Approve / Edit (immutable versions) | **Verified** | Approve API + revision create |
| Initial launch ≠ approval; activation gate | **Verified** | `INITIAL_LAUNCH_NOT_READY` then activate OK |
| Activate ≠ paid render ≠ publish | **Verified** | Activate succeeded without auto-render; render needs grant |
| Video Remotion / fal / Hybrid | **Partial** | Remotion live MP4 **Verified** (`render:verify`); `/api/internal/render/remotion` persists to `renders`; fal/ElevenLabs gateways **Implemented** (fixture unit tests); Hybrid + full review E2E open |
| Video Approve / Regenerate | **Verified** (approve); regenerate **Implemented** | Smoke approved attempt |
| Publishing calendar + schedule form | **Implemented** | UI + `publishing_jobs` API; live OAuth **Blocked** |
| BYOK no silent managed fallback | **Verified** | Unit policy + fixture BYOK execute decrypt; invalid/missing key → `BYOK_KEY_INVALID` |
| Telegram continuity | **Partial** | WF-A2 JSON + resolve-actor stub; bot **Blocked** |
| n8n all 11 workflows | **Verified** (import) | 13 JSON imported via REST; WF-A1/A3 E2E **Verified** (fixture) |

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
| FR-10–11 | Video / narration | **Fixture** |
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
| WF-A2 Telegram Gateway | JSON **Implemented**; credentials **Blocked** |
| WF-A3 Shared Creative Agent | **Verified** (sub-workflow via A1; fixture AI) |
| WF-01 Ideation | JSON **Implemented** |
| WF-02 Video Production | JSON **Implemented** |
| WF-03 Publishing | JSON **Implemented** |
| WF-04 Error / Recovery | JSON **Implemented** |
| WF-05 Research | JSON **Implemented** |
| WF-06 Notifications | JSON **Implemented** |
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
