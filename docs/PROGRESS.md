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
| Hybrid headless | No compositor exists server-side; WF-02 now fails it explicitly (`HYBRID_HEADLESS_NOT_IMPLEMENTED`) instead of the old fake `ready_for_review` — fixed 2026-11-20, use browser export's "include footage and narration" instead |

## Generate-video-flow correctness fix (2026-11-20)

The fal and hybrid branches of WF-02 could previously reach `ready_for_review`
with **no output asset at all** — fal submit is async (`queued`/`in_progress`)
but WF-02 never polled it, and `completeVideoJob`'s "don't fake success" guard
only covered `production_mode === "remotion"`. A creator could approve a
"finished" video that was never rendered.

Fixed:
- `completeVideoJob` (`packages/domain/src/services/videos.ts`) now requires a
  verified `outputAssetId` for **every** production mode, not just remotion.
- `/api/internal/media/fal` persists a real `media_assets` row (downloads the
  provider's output URL server-side) whenever a submit/poll call reports
  `status: "completed"`, and returns `outputAssetId` directly.
- WF-02 now loops submit → poll (bounded at 24 × 5s) until `outputAssetId` is
  present before calling `jobs/complete`; hybrid fails immediately and
  honestly since no headless compositor exists.
- `QueueVideoButton` copy no longer implies Remotion/Hybrid work unattended —
  only fal does today.

## Video queue safety net (2026-11-20)

Video production previously depended on one fire-and-forget webhook call; a
lost call (or any regenerate, which never dispatched) left jobs `queued`
forever. Now (ADR-013):
- `dispatchVideoProduction` (`apps/web/src/lib/n8n/`) wakes WF-02 via `after()`
  from both render and regenerate.
- `claim-due` `kind: "video_jobs"` → `listStaleQueuedVideoJobs` (queued 2 min–24 h).
- **WF-02S Video Queue Sweeper** (cloud id `fOYSmnb1rKkzn9KY`) dispatches those
  into WF-02 every 2 min. **Publish it after the app deploy** — before that,
  the live API rejects the new kind.
- WF-02: webhook acks on receipt, sub-workflow entry, lost claim = no-op,
  Remotion branch no longer double-completes. `failVideoJob` won't overwrite
  finished jobs.

## Blockers

| Item | Notes |
|---|---|
| Provider keys | Live OpenAI/fal/ElevenLabs/YouTube not supplied (adapters ready; fixture-tested). Telegram bot token obtained 2026-11-20 and applied as the n8n `Telegram account` credential. |
| Playwright Chromium | Install aborted — re-run `pnpm exec playwright install chromium` |
| Supabase Cloud | Auth + M4 job→storage **Verified**; Mailtrap SMTP optional for signup emails |
| n8n | `N8N_WEBHOOK_BASE_URL`/`N8N_BASE_URL` point at `codebyhani.app.n8n.cloud`. All 13 workflows (WF-01…08, WF-A1/A2/A3, SUB Progress Reporter, SUB Scoped Domain Tool) are on the instance and published, using `$vars` and the shared `Telegram account` credential. 2026-11-20: WF-02 fal poll loop + honest hybrid failure published via the n8n MCP connector; WF-06 telegram missing-chatId guard published. The cloud copies of WF-06/WF-A2 had been edited directly (inline Approve/Refine keyboard, `notifications/complete`, Telegram acks) and were ahead of the repo — repo JSON re-synced from the live versions. Treat the instance as source of truth for these and re-export after any direct edit. |
| Browser WebCodecs | Chrome 94+ / Firefox 130+ / Safari 26+ required for in-browser MP4 |

## Decisions

See [DECISIONS.md](DECISIONS.md).
