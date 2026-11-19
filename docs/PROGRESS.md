# Implementation Progress

Last updated: 2026-11-20

## Milestone status

| Milestone | Status | Notes |
|---|---|---|
| M1 Foundation | **done** | Monorepo, schema+RLS, auth, studio shell, Overview |
| M2 Shared Agent | **partial** | Sync gateway **Verified**; Agent→n8n WF-A1/A3→gateway→draft **Verified** (fixture AI); live OpenAI still needs keys |
| M3 Projects / Content / Activation | **partial** | Lifecycle and Creative Kit exist. Project tabs now load real concepts, rules, publishing jobs, assets, and workflow runs. Existing drafts created before this change still have empty scripts. New agent drafts include a labeled fixture script, storyboard, and publishing pack. |
| M4 Video production | **partial** | Browser export is opt-in, 480p, ~4s, captions-only by default. Preview is not mounted until requested. Full Chrome encode still not verified here. Cloud render still not provisioned. |
| M5 Automation / Publishing / Telegram | **partial** | UI + APIs + n8n JSON; live OAuth/Telegram blocked |
| M6 Docs / hardening | **partial** | Specs + architecture + traceability landed; Playwright scaffold present (`ACS_E2E=1`) |

## Documentation

- `docs/specifications/{PRD,TDD,N8N_WORKFLOWS,UX_SPECIFICATION}.md` — full Master Package copies
- `docs/design/` — v2.7 prototype, screenshots, history
- `docs/ARCHITECTURE.md`, `docs/TRACEABILITY.md`, portfolio `README.md`

## Verified locally (API smoke)

1. Signup / login / Overview — **Cloud auth Verified** (2026-11-19)
1b. Agent (fixture) → draft project + concept → approve → `produce_paid_media` grant → Remotion live → Cloud `renders` storage → review URL — **Verified** (2026-11-19)
2. Agent message → Draft Project via **AI Provider Gateway** sync path (fixture)
3. Concept approve + initial-launch + activate
4. Render blocked without grant → grant → job → claim/complete → video approve
5. BYOK store → fixture verify → mode switch → `/api/internal/ai/execute` returns `mode:"byok"` after in-process decrypt (fixture completion; no silent managed fallback)
6. Managed fixture execute after allowance exhaustion (fixtureMode skips spend gate)
7. n8n: imported all 13 workflows; WF-A1 active; Agent `accepted` → WF-A1/A3 success → draft project (`runStatus: completed`)

Unit tests: 19 passed (`@acs/domain` 15 + `@acs/integrations` 4).

## Next implementation priorities

1. Browser-render E2E smoke on a real approved concept (Chrome WebCodecs) + visual review
2. Vercel Sandbox remotion adapter when authorized (unattended / n8n-only production)
3. Playwright: `pnpm exec playwright install chromium` then `ACS_E2E=1 pnpm test:e2e`
4. Live OpenAI / fal / ElevenLabs when authorized — no paid calls yet
5. Telegram / YouTube OAuth
6. n8n Cloud / broader deploy only when separately authorized

## Unattended video production (still incomplete)

| Gap | Notes |
|---|---|
| Vercel Sandbox | Stub only (`renderRemotionInVercelSandbox`); not provisioned; no paid runs |
| Browser-closed jobs | Interrupt API marks failed — no auto-resume without a user tab |
| fal + ElevenLabs in composition | Adapters exist; not mixed into ShortFormVideo timeline yet |
| Headless n8n-only MP4 | Requires Sandbox (or legacy worker); browser backend returns `awaitingBrowser` |

## Blockers

| Item | Notes |
|---|---|
| Provider keys | Live OpenAI/fal/ElevenLabs/Telegram/YouTube not supplied (adapters ready; fixture-tested) |
| Playwright Chromium | Install aborted — re-run `pnpm exec playwright install chromium` |
| Supabase Cloud | Auth + M4 job→storage **Verified**; Mailtrap SMTP optional for signup emails |
| n8n | Force-recreate after token changes; import workflows from `n8n/workflows/` (recreate alone does not import); production rejects aliases |
| Browser WebCodecs | Chrome 94+ / Firefox 130+ / Safari 26+ required for in-browser MP4 |

## Decisions

See [DECISIONS.md](DECISIONS.md).
