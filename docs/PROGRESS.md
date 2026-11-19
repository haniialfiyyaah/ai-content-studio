# Implementation Progress

Last updated: 2026-11-20

## Milestone status

| Milestone | Status | Notes |
|---|---|---|
| M1 Foundation | **done** | Monorepo, schema+RLS, auth, studio shell, Overview |
| M2 Shared Agent | **partial** | Local sync planning remains the live path because `N8N_WEBHOOK_BASE_URL` is empty. Cloud drafts exist for WF-A1 and WF-A3 and are not published. The UI polls `/api/agent/runs/[id]` once a webhook run is accepted. |
| M3 Projects / Content / Activation | **partial** | Project content can save an initial-launch set. Empty drafts can be filled with a labeled fixture script. Script edits create a new draft version. The home is now the "Calm Studio" conversation (see below). Secondary screens use the new palette but keep their earlier layouts. |
| M4 Video production | **partial** | Browser export stays opt-in. Production and video review now call approve, revoke, and regenerate. Approval still requires `ready_for_review` and a verified MP4. Full Chrome encode is still not verified here. |
| M5 Automation / Publishing / Telegram | **partial** | UI + APIs + n8n JSON; live OAuth/Telegram blocked |
| M6 Docs / hardening | **partial** | Specs + architecture + traceability landed; Playwright scaffold present (`ACS_E2E=1`) |

## Documentation

- `docs/specifications/{PRD,TDD,N8N_WORKFLOWS,UX_SPECIFICATION}.md` — full Master Package copies
- `docs/design/` — v2.7 prototype, screenshots, history
- `docs/ARCHITECTURE.md`, `docs/TRACEABILITY.md`, portfolio `README.md`

## Calm Studio redesign (2026-11-20)

The creator chose layout C (conversation-first) with the stone palette over a board and an inbox layout. Direction: `apps/web/.impeccable/surfaces/src-app-app-page-tsx.md`; system: `apps/web/DESIGN.md`.

- **Home is the agent conversation.** `/` renders the latest `agent_conversations` thread, a composer, and a "These need your call" card inline. A right column shows today's counts, the last real run, and recent Projects.
- **Consent track.** Each concept shows four separate gates (Concept, Spend, Video, Publish), derived only from persisted rows (`src/lib/consent-track.ts`). It appears on the home card and, wide, on Content Detail.
- **Spend authorization UI (new).** Before this, no screen created a `produce_paid_media` grant, so production could not start from the UI. `AuthorizeSpendButton` now confirms "Up to $5.00 for 30 days on this Project" and posts to `/api/projects/{id}/grants`, from the home card and the Content Detail Production tab.
- **Palette.** Stone ground, sage for the agent, sand for the creator, teal only for primary actions and done gates, clay only for blocked. All text pairs pass WCAG AA; form-field borders use `--rule-input` (3:1). The last lavender (Projects cards) now uses the shared project tiles.
- **Shell.** 76px icon rail on desktop; top bar, five-item tab bar and drawer on mobile.

Checked: typecheck passes, impeccable detector reports no issues, home confirmed by screenshot at about 1024px. **Not yet checked live:** Content Detail in the new palette, 390px mobile, and the finish review, which needs desktop and mobile screenshots in `.impeccable/review/`. `/agent` (`agent-chat.tsx`) still has the older styling and overlaps the new home.

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
3. Capture desktop and mobile screenshots of the Calm Studio home and Content Detail, then run the finish review; decide whether `/agent` is aligned or retired now that home is the conversation
4. Finish remaining screen layouts: content storyboard, calendar management, library, settings sections
5. Vercel Sandbox remotion adapter when authorized
6. Live OpenAI / fal / ElevenLabs when authorized — no paid calls yet

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
| n8n | Cloud account now has WF-A1, WF-A3, published WF-04 Error Handling, SUB Progress Reporter, and SUB Scoped Domain Tool. A1, A3, the progress reporter, and the domain tool point at WF-04. Still only in the repo: WF-01, WF-02, WF-03, WF-05, WF-06, WF-07, WF-08, WF-A2. Webhook URL remains empty. |
| Browser WebCodecs | Chrome 94+ / Firefox 130+ / Safari 26+ required for in-browser MP4 |

## Decisions

See [DECISIONS.md](DECISIONS.md).
