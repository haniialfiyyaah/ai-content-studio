# Implementation Progress

Last updated: 2026-11-19

## Milestone status

| Milestone | Status | Notes |
|---|---|---|
| M1 Foundation | **done** | Monorepo, schema+RLS, auth, studio shell, Overview |
| M2 Shared Agent | **partial** | Sync gateway path **Verified** (fixture); n8n WF-A1/A3 JSON carries `ownerId`; live webhook E2E needs import + `N8N_WEBHOOK_BASE_URL` |
| M3 Projects / Content / Activation | **done** | Lifecycle, Creative Kit, Content Detail, launch gates |
| M4 Video production | **fixture** | Job pipeline **Verified**; Remotion composition scaffold + honest fixture worker (live encode blocked by disk / packages) |
| M5 Automation / Publishing / Telegram | **partial** | UI + APIs + n8n JSON; live OAuth/Telegram blocked |
| M6 Docs / hardening | **partial** | Specs + architecture + traceability landed; Playwright scaffold present (`ACS_E2E=1`) |

## Documentation

- `docs/specifications/{PRD,TDD,N8N_WORKFLOWS,UX_SPECIFICATION}.md` — full Master Package copies
- `docs/design/` — v2.7 prototype, screenshots, history
- `docs/ARCHITECTURE.md`, `docs/TRACEABILITY.md`, portfolio `README.md`

## Verified locally (API smoke)

1. Signup / login / Overview
2. Agent message → Draft Project via **AI Provider Gateway** sync path (fixture)
3. Concept approve + initial-launch + activate
4. Render blocked without grant → grant → job → claim/complete → video approve
5. BYOK store → fixture verify → mode switch → `/api/internal/ai/execute` returns `mode:"byok"` after in-process decrypt (fixture completion; no silent managed fallback)
6. Managed fixture execute after allowance exhaustion (fixtureMode skips spend gate)

Unit tests: 19 passed (`@acs/domain` 15 + `@acs/integrations` 4).

## Next implementation priorities

1. Import/activate WF-A1/A3 in n8n; set `N8N_WEBHOOK_BASE_URL`; E2E Agent→n8n→gateway
2. Live OpenAI when `OPENAI_API_KEY` / real BYOK key available (`ACS_AI_FIXTURE_MODE=false`)
3. Remotion live encode once disk + `remotion`/`@remotion/renderer` + Chromium available
4. Playwright with `ACS_E2E=1` against running stack
5. Remaining providers (fal, ElevenLabs, Telegram, YouTube OAuth)

## Blockers

| Item | Notes |
|---|---|
| Provider keys | Live OpenAI/fal/ElevenLabs/Telegram/YouTube not supplied |
| Disk space | ~2GB free — cannot install Remotion/Chromium here |
| n8n API import | Needs `N8N_API_KEY` or UI import; CLI: `docker exec … n8n import:workflow` |
| Docker compose | Use `docker-compose`; Supabase: `--ignore-health-check -x logflare,vector` |

## Decisions

See [DECISIONS.md](DECISIONS.md).
