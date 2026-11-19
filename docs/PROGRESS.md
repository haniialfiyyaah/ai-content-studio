# Implementation Progress

Last updated: 2026-11-20

## Milestone status

| Milestone | Status | Notes |
|---|---|---|
| M1 Foundation | **done** | Monorepo, schema+RLS, auth, studio shell, Overview |
| M2 Shared Agent | **partial** | Local sync planning remains the live path because `N8N_WEBHOOK_BASE_URL` is empty. Cloud drafts exist for WF-A1 and WF-A3 and are not published. The UI polls `/api/agent/runs/[id]` once a webhook run is accepted. |
| M3 Projects / Content / Activation | **partial** | Project content can save an initial-launch set. Empty drafts can be filled with a labeled fixture script. Script edits create a new draft version. Shell, type, and color now follow the v2.7 prototype. Screen-by-screen layout is still thinner than the prototype. |
| M4 Video production | **partial** | Browser export stays opt-in. Production and video review now call approve, revoke, and regenerate. Approval still requires `ready_for_review` and a verified MP4. Full Chrome encode is still not verified here. |
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

1. Publish cloud WF-A1 only after `ACS_API_BASE_URL` and `ACS_INTERNAL_SERVICE_TOKEN` are set on n8n and the app has a public URL. Then set `N8N_WEBHOOK_BASE_URL` to `https://codebyhani.app.n8n.cloud/webhook`.
2. Browser-render E2E smoke on a real approved concept (Chrome WebCodecs) + visual review
3. Finish remaining v2.7 screen layouts: project cards, content storyboard, calendar management, library, settings sections
4. Vercel Sandbox remotion adapter when authorized
5. Live OpenAI / fal / ElevenLabs when authorized — no paid calls yet

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
| n8n | Cloud drafts: WF-A3 `Tx1J1HPtoBAeLgQS`, WF-A1 `8qdIEtuApGDJXrPD` at `codebyhani.app.n8n.cloud`. Not published. App webhook URL remains empty so planning does not fire at an unreachable host. |
| Browser WebCodecs | Chrome 94+ / Firefox 130+ / Safari 26+ required for in-browser MP4 |

## Decisions

See [DECISIONS.md](DECISIONS.md).
