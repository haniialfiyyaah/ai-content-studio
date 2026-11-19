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
| First actionable message → Draft Project | **Verified** (fixture AI) | `POST /api/agent/messages` created project |
| Agent → n8n → gateway live LLM | **Partial / Fixture** | Dispatch if webhook set; sync path uses fixture; gateway live needs `OPENAI_API_KEY` + `ACS_AI_FIXTURE_MODE=false` |
| Unified Project Detail by status | **Implemented** | `/projects/[id]` tabs + lifecycle actions |
| Concept Approve / Edit (immutable versions) | **Verified** | Approve API + revision create |
| Initial launch ≠ approval; activation gate | **Verified** | `INITIAL_LAUNCH_NOT_READY` then activate OK |
| Activate ≠ paid render ≠ publish | **Verified** | Activate succeeded without auto-render; render needs grant |
| Video Remotion / fal / Hybrid | **Fixture** | Job pipeline verified; Remotion worker stub; fal fixture |
| Video Approve / Regenerate | **Verified** (approve); regenerate **Implemented** | Smoke approved attempt |
| Publishing calendar + schedule form | **Implemented** | UI + `publishing_jobs` API; live OAuth **Blocked** |
| BYOK no silent managed fallback | **Verified** (policy) | Unit + mode switch → `BYOK_KEY_INVALID`; live BYOK execute decrypt **Partial** |
| Telegram continuity | **Partial** | WF-A2 JSON + resolve-actor stub; bot **Blocked** |
| n8n all 11 workflows | **Implemented** (JSON) | `n8n/workflows/*.json`; live import/run **Partial** |

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
| FR-25 | Managed OpenAI + BYOK | **Partial** (policy verified; live paths incomplete) |

## n8n workflows

| ID | Status |
|---|---|
| WF-A1 Web Agent Gateway | JSON **Implemented**; live E2E **Partial** |
| WF-A2 Telegram Gateway | JSON **Implemented**; credentials **Blocked** |
| WF-A3 Shared Creative Agent | JSON **Implemented**; calls gateway HTTP |
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
| Domain unit (`@acs/domain`) | **Verified** — 14 tests |
| Integrations unit (`@acs/integrations`) | **Verified** — 4 tests |
| Playwright E2E | **Not started** |
| n8n contract/import CI | **Not started** |

## Spec documents in-repo

| Doc | Path |
|---|---|
| PRD v2.2 | [specifications/PRD.md](specifications/PRD.md) |
| TDD v2.2 | [specifications/TDD.md](specifications/TDD.md) |
| n8n Spec v1.1 | [specifications/N8N_WORKFLOWS.md](specifications/N8N_WORKFLOWS.md) |
| UX Spec v2.7 | [specifications/UX_SPECIFICATION.md](specifications/UX_SPECIFICATION.md) |
