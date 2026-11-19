# Implementation Progress

Last updated: 2026-11-19

## Milestone status

| Milestone | Status | Notes |
|---|---|---|
| M1 Foundation | **done** | Monorepo, schema+RLS, auth, studio shell, Overview |
| M2 Shared Agent | **partial** | Sync gateway **Verified**; Agent→n8n WF-A1/A3→gateway→draft **Verified** (fixture AI); live OpenAI still needs keys |
| M3 Projects / Content / Activation | **done** | Lifecycle, Creative Kit, Content Detail, launch gates |
| M4 Video production | **partial** | Job pipeline **Verified**; Remotion live encode **Verified** (local MP4 via `render:verify`); fal/ElevenLabs adapters **Implemented** (fixture-tested); compose quality + full job→storage→review E2E still open |
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
7. n8n: imported all 13 workflows; WF-A1 active; Agent `accepted` → WF-A1/A3 success → draft project (`runStatus: completed`)

Unit tests: 19 passed (`@acs/domain` 15 + `@acs/integrations` 4).

## Next implementation priorities

1. Remotion composition quality (PRD motion/layouts) + authorized job → storage → video review E2E
2. Playwright: `pnpm exec playwright install chromium` then `ACS_E2E=1 pnpm test:e2e` (install was aborted once)
3. `docker-compose up -d --force-recreate n8n` so container token matches `.env` (no hardcoded legacy tokens)
4. Live OpenAI when you authorize keys (`ACS_AI_FIXTURE_MODE=false`) — managed/BYOK path ready, no paid calls yet
5. Telegram / YouTube OAuth

## Blockers

| Item | Notes |
|---|---|
| Provider keys | Live OpenAI/fal/ElevenLabs/Telegram/YouTube not supplied (adapters ready; fixture-tested) |
| Playwright Chromium | Install aborted — re-run `pnpm exec playwright install chromium` |
| Supabase local | Start stack or use Cloud via MCP (ADR-008) if disk blocks Docker |
| n8n recreate | Force-recreate after token changes; production rejects aliases |

## Decisions

See [DECISIONS.md](DECISIONS.md).
