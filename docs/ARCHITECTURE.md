# Architecture — v2 (2026-11-21)

Product flow: `docs/FLOW.md` (guided setup → content → storyboard → images →
video → publish). Old v2.7 design: git tag `v1-legacy`.

```
Overview idea ──► POST /api/projects ── project (status setup) + web conversation
                   │  similar check (embeddings, in code) → "continue there / different project?"
                   │  WF-05 Setup Agent: concept → Creative Kit → pillars & guardrails (refine / continue)
                   ▼  Lock setup → generation_run (ideation)
WF-01 Generate ──► contents (status idea; AI options per field + scenes), duplicate heads-up
                   ▼  Approve & schedule (launch): untick = remove, approve the rest, slot, go live
Approve ─────────► storyboard images (self-call /api/internal/storyboard/run)
Live ────────────► video_renders (queued) + publish_jobs (scheduled)
                   │  WF-02 render: scene images (reused from the storyboard) + ElevenLabs narration
                   │               → Remotion renderer on EC2 → Storage → Download
                   │  WF-03: due jobs → YouTube resumable upload
                   ▼  WF-06: Telegram notifications · UI via Supabase Realtime
```

## Layers

| Layer | Where | Rule |
|---|---|---|
| UI | `apps/web/src/app/(app)` server components + small client islands | Pages re-render on Realtime changes (`LiveRefresh`). |
| Domain (pure) | `packages/domain` | Types, zod contracts (n8n ↔ API, user payloads), schedule slots, `projectKit()`. Unit-tested. |
| Server services | `apps/web/src/lib/server/*` | Only place that writes the DB. User actions check ownership; trusted writes use the service role. |
| Provider adapters | `packages/integrations` | OpenAI images + embeddings, fal, ElevenLabs, YouTube, Telegram, AES secrets. |
| Orchestration | n8n on EC2 (`deploy/ec2`) | Never touches the DB. Calls `/api/internal/*` with `x-acs-service-token`. |
| Data | Supabase — `supabase/migrations/20261121000000_v2_baseline.sql` | Owner RLS everywhere; tokens + workflow errors are service-only. |

### Server modules

| Module | Owns |
|---|---|
| `setup.ts` | guided setup: start, similar check, stage tasks for WF-05, refine / continue, lock |
| `similar.ts` | embeddings: similar projects (≥ 0.55) and duplicate content (≥ 0.70 / close ≥ 0.55) |
| `projects.ts` | ideas, revisions, approve / remove / hold, launch, schedule slots, lifecycle, settings |
| `content-actions.ts` | the single content action dispatcher |
| `storyboard.ts` | drawing scene images on approve, reuse by the render |
| `renders.ts` / `publishing.ts` | video pipeline, YouTube upload |
| `signals.ts` | project signals: needs you · in progress · next upload · auto/manual |
| `internal.ts` | WF-01 / WF-A1 / scheduler contracts |
| `telegram.ts` | the bot (decides, returns Bot API calls) |

## User API

| Method & path | Purpose |
|---|---|
| `POST /api/projects` `{ idea }` | start a project (similar check, then setup) |
| `POST /api/projects/:id/setup` `{ action: continue · retry · start_new · use_similar }` | setup buttons |
| `POST /api/projects/:id/messages` `{ content }` | chat (setup agent during setup, project agent after) |
| `PATCH /api/projects/:id/settings` `{ schedule?, ending?, imageEngine?, visualMode?, autoApprove? }` | project settings |
| `POST /api/projects/:id/ideas` `{ count, brief? }` · `POST …/ideas/retry` | new content ideas · retry a failed run |
| `POST /api/projects/:id/launch` `{ include, exclude }` | Approve & schedule (go live when YouTube is connected) |
| `POST /api/projects/:id/lifecycle` `{ action: activate · pause · resume · stop }` | project lifecycle |
| `POST /api/projects/:id/renders` | render every approved content without a video |
| `/api/projects/:id/assets`, `…/assets/upload-url`, `…/identity`, `DELETE /api/assets/:id` | reference images, the character |
| `PATCH /api/contents/:id` `{ field, index }` | pick an AI option |
| `POST /api/contents/:id/actions` `{ action }` | approve · remove · hold · resume · unlock · storyboard · render · publish |
| `GET /api/renders/:id/download` · `POST /api/renders/:id/retry` | video file · re-render |
| `/api/profile`, `/api/auth/*`, `/api/integrations/{youtube,telegram}` | account |

## Internal API (n8n, `x-acs-service-token`) — grouped by workflow

| Group | Routes | Caller |
|---|---|---|
| `setup/` | `context` · `complete` · `fail` | WF-05 Setup Agent |
| `generation/` | `context` · `progress` · `complete` · `fail` | WF-01 Generate |
| `agent/` | `context` · `reply` | WF-A1 Project Agent |
| `renders/` | `start` · `poll` · `callback` · `fail` | WF-02 Render |
| `publish/run` · `analytics/run` | | WF-03 |
| `notifications/` | `deliver` · `complete` | WF-06 |
| `telegram/update` | | WF-A2 |
| `claim-due` | | WF-00 Queue Scheduler |
| `storyboard/run` | | the app itself (after approve) |
| `workflows/error` | | WF-04 |

## Queue model (no lost work)

Every job is a row first. The app fires a webhook as a **fast path** (`after()`),
and **WF-00 Queue Scheduler** re-dispatches anything still `queued`. Claims are
compare-and-set (`queued → rendering`, `scheduled → publishing`), so webhook +
scheduler can race safely. Stuck work is failed server-side so the UI never
spins forever. (WF-00, WF-03 and WF-06 are currently deactivated to save
executions — turn them on for scheduled publishing and Telegram alerts.)

## n8n workflows (EC2, `https://acs-n8n.duckdns.org`)

| Workflow | Id | Trigger |
|---|---|---|
| WF-00 Queue Scheduler | `krK0OAzIBgi4Cipw` | every 10 min |
| WF-01 Generate Project | `KaGdNHPG09cuFwbb` | webhook `acs-generate` |
| WF-02 Render Video | `FN8Eqd6rIQDug8jJ` | webhook `acs-render` |
| WF-03 Publishing & Analytics | `eEmksYHu2wE1BtaH` | every 15 min / 12 h |
| WF-04 Error Handling | `Hs5qQeqXcbQ46etY` | error trigger |
| WF-05 Setup Agent | `SwLZlWgTOlSCQw1Y` | webhook `acs-setup` |
| WF-06 Notifications | `23qsgCiuUne5tl5a` | every 3 min |
| WF-A1 Project Agent Chat | `ElL4pmD7I4BlwdJf` | webhook `acs-agent-chat` |
| WF-A2 Telegram Gateway | `CNN8fpiUxy2JVKaq` | Telegram trigger |
| SUB Telegram Send | `hXxZiAIs1TNZ7dfx` | sub-workflow (all outbound Telegram) |

Env on EC2: `ACS_API_BASE_URL`, `ACS_INTERNAL_SERVICE_TOKEN`, `TELEGRAM_BOT_TOKEN`
(see `deploy/ec2/.env.example`). OpenAI runs on the n8n OpenAI credential.

## Video pipeline (Remotion on EC2)

1. Scene images come from the storyboard drawn on approve; missing ones are drawn by the
   project's engine (**OpenAI** `gpt-image-2.6-flare` → fallbacks, or **fal**), the other engine
   is the backup, then the user's reference, then a gradient. Narration via ElevenLabs with
   word timings → captions.
2. When images are settled the app POSTs the job to `RENDERER_URL/render` with a signed upload URL.
3. `apps/renderer` renders the `Short` composition (720p, Ken Burns, crossfades, hook card,
   word-by-word captions, designed end screen), uploads the MP4 and calls `/api/internal/renders/callback`.

## Telegram

WF-A2 forwards every update to `/api/internal/telegram/update`; the bot
(`lib/server/telegram.ts`) **returns** the Bot API calls and **SUB Telegram Send**
posts them (the app never holds the bot token). A new idea sent to the bot starts
the same guided setup and links to the app to continue.
