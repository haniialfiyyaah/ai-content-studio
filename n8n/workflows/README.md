# AI Content Studio — n8n workflows

Importable workflow JSON for local Docker n8n (`pnpm n8n:up`). Spec baseline: n8n Workflow Design v1.1 / TDD v2.2.

## Import

1. Ensure env is set for the n8n container: `ACS_API_BASE_URL`, `ACS_INTERNAL_SERVICE_TOKEN` (see repo `.env.example` / `n8n/credentials.example.md`).
2. Import options:
   - **UI:** Open n8n (`http://localhost:5678`) → **Workflows → Import from File** (or drag-drop JSON).
   - **CLI (mounted volume):** `docker exec <n8n-container> n8n import:workflow --separate --input=/workflows`
   - **API helper:** create an n8n API key, then `N8N_API_KEY=… pnpm n8n:import` (skips files that look like secret leaks).
3. Activate workflows after credentials/env are ready. Set **WF-04 Error Handling** as the Error Workflow on other workflows when configuring recovery.
4. After import, re-link **Execute Sub-workflow** nodes if n8n remapped IDs (workflows are matched by name in these exports).
5. For Web Agent live dispatch, set `N8N_WEBHOOK_BASE_URL=http://localhost:5678/webhook` in `apps/web/.env.local` and activate **WF-A1**.

All domain HTTP nodes call `{{$env.ACS_API_BASE_URL}}/api/internal/...` with header `x-acs-service-token={{$env.ACS_INTERNAL_SERVICE_TOKEN}}`. Provider secrets stay in Next.js / workers, not in n8n. WF-A1 merges `ownerId` from resolve-context before launching WF-A3.

## Phase map

| Phase | Workflows | Role |
|---|---|---|
| **1 — App & agent foundation** | `WF-A1`, `WF-A3`, `WF-04` | Web agent gateway, shared creative agent, error recording |
| **2 — Creative production** | `WF-02`, `WF-08` | Video production orchestration, provider reconciliation |
| **3 — Automation & distribution** | `WF-A2`, `WF-01`, `WF-03`, `WF-05`, `WF-06` | Telegram gateway, scheduled ideation, publishing, research, notifications |
| **4 — Advanced / analytics** | `WF-07` | Platform analytics refresh |

Helpers (not phase-gated product workflows): `SUB-progress-reporter`, `SUB-scoped-domain-tool`.

## Files

| File | Name | Trigger |
|---|---|---|
| `WF-A1-web-agent-gateway.json` | WF-A1 Web Agent Gateway | Webhook |
| `WF-A2-telegram-agent-gateway.json` | WF-A2 Telegram Agent Gateway | Telegram Trigger |
| `WF-A3-shared-creative-agent.json` | WF-A3 Shared Creative Agent | Execute Workflow Trigger |
| `WF-01-scheduled-ideation.json` | WF-01 Scheduled Ideation | Schedule (5m) |
| `WF-02-video-production.json` | WF-02 Video Production | Webhook |
| `WF-03-scheduled-publishing.json` | WF-03 Scheduled Publishing | Schedule (2m) |
| `WF-04-error-handling.json` | WF-04 Error Handling | Error Trigger |
| `WF-05-trend-product-research.json` | WF-05 Trend and Product Research | Execute Workflow Trigger |
| `WF-06-notifications.json` | WF-06 Notifications | Schedule (1m) |
| `WF-07-platform-analytics.json` | WF-07 Platform Analytics | Schedule (6h) |
| `WF-08-provider-reconciliation.json` | WF-08 Provider Reconciliation | Schedule (3m) |
| `SUB-progress-reporter.json` | SUB Progress Reporter | Execute Workflow Trigger |
| `SUB-scoped-domain-tool.json` | SUB Scoped Domain Tool | Execute Workflow Trigger |

## Suggested import order

1. Helpers: `SUB-*`, then `WF-04`, `WF-A3`, `WF-05`
2. Gateways: `WF-A1`, `WF-A2`
3. Production: `WF-02`, `WF-08`
4. Automation: `WF-01`, `WF-03`, `WF-06`, `WF-07`

## Notes

- Graphs are coherent orchestration skeletons aligned to TDD internal paths (`jobs/*`, `automation/claim-due`, `publish/authorize-claim`, `telegram/resolve-actor`, `ai/check-policy|execute`, `workflows/record-error`, `providers/callback`). They are intentionally lean vs the full design node inventory.
- Telegram outbound / email transport goes through ACS internal HTTP (or later native nodes + credentials); bot credentials are optional until Phase 3 Telegram continuity is live.
- Design package (non-importable): `../AI-Content-Studio-Complete-Package-v2.7/02_n8n_Workflow_Design/v1.1/`.
