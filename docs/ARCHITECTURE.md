# Architecture — v2.7 rebuild (2026-11-20)

Source of truth for UX: `AI-Content-Studio-Complete-Package-v2.7` (prototype + screen spec).
Product flow simplified by the owner: **no spend approval, no BYOK, no manual text editing.**

```
Overview prompt ──► project (generating) + its own conversation + generation_run
                     │  WF-01 (webhook, OpenAI): plan → Creative Kit + research → N contents
                     ▼  each content: 3 AI options per field (title/hook/script/caption/hashtags) + scenes
Review (dropdowns) ──► Approve all ──► Schedule (days/time/tz → slot per content)
                     ▼  readiness: generated · all approved · scheduled · YouTube connected
Activate ──► video_renders (queued) + publish_jobs (scheduled)
                     │  WF-02 render: scene images (fal: AI / reference-guided / your uploads) + ElevenLabs narration
                     │               → Railway Remotion renderer (motion, captions, hook) → Storage → Download
                     │  WF-03 every 5 min: due jobs → YouTube resumable upload (3 attempts)
                     ▼  WF-06 every 1 min: Telegram notifications · UI updates via Supabase Realtime
```

## Layers

| Layer | Where | Rule |
|---|---|---|
| UI | `apps/web/src/app/(app)` server components + small client islands | Design system = prototype CSS verbatim (`globals.css`). Pages re-render on Realtime changes (`LiveRefresh`). |
| Domain (pure) | `packages/domain` | Types, zod contracts (n8n ↔ API), schedule slots, readiness. Unit-tested. |
| Server services | `apps/web/src/lib/server/*` | Only place that writes the DB. User actions check ownership; trusted writes use the service role. |
| Provider adapters | `packages/integrations` | fal (submit/poll/compose), ElevenLabs, YouTube OAuth/upload/stats, AES secrets. |
| Orchestration | n8n Cloud | Never touches the DB. Calls `/api/internal/*` with `x-acs-service-token`. |
| Data | Supabase (`supabase/migrations/20261120000000_v27_schema.sql`) | Owner RLS everywhere; tokens + workflow errors are service-only. |

## Queue model (no lost work)

Every job is a row first. The app fires a webhook as a **fast path** (`after()`),
and **WF-00 Queue Scheduler** (every 2 min) re-dispatches anything still
`queued`. Claims are compare-and-set (`queued → rendering`, `scheduled → publishing`),
so webhook + scheduler can race safely. Stuck work is failed server-side
(generation > 15 min, render > 45 min) so the UI never spins forever.

## n8n workflows (cloud ids)

| Workflow | Id | Trigger |
|---|---|---|
| WF-00 Queue Scheduler | `c3VwV5JlwWHW02Gr` | every 2 min |
| WF-01 Generate Project | `HAcp9KphY2c6quix` | webhook `acs-generate` + sub-workflow |
| WF-02 Render Video | `pFPyYRiZKu9dr2LO` | webhook `acs-render` + sub-workflow |
| WF-03 Publishing & Analytics | `nesO8x03td8rF25k` | every 5 min / every 6 h |
| WF-04 Error Handling | `Skab0JCwPCgIgrYN` | error trigger (all workflows) |
| WF-06 Notifications | `ZMoSD2okLc7psv3z` | every 1 min |
| WF-A1 Project Agent Chat | `1FOlfsXAnFVbqDzw` | webhook `acs-agent-chat` |
| WF-A2 Telegram Gateway | `EAETpN89kJ1GVTC4` | Telegram trigger |

n8n variables: `ACS_API_BASE_URL`, `ACS_INTERNAL_SERVICE_TOKEN`.
OpenAI runs on n8n's OpenAI credential (currently n8n gateway credits; swap to the Studio key in the
`OpenAI (plan|content|agent)` nodes for production volume).

## Video pipeline (Remotion on Railway)

1. `renders/start` (claim) → one image per scene via the provider chain
   **OpenAI images** (`gpt-image-1`, edits for reference-guided) → **fal** (Flux / Kontext) →
   **user's reference** → **gradient**. `visual_mode=references` uses uploads directly. Narration via
   ElevenLabs with word timings → captions (even timing when no voice).
2. `renders/poll` advances images (one fallback to Flux Schnell; a scene that still fails becomes a gradient).
3. When images are settled the app POSTs the job to `RENDERER_URL/render` with a signed upload URL.
4. `apps/renderer` renders the `Short` composition (1080×1920, Ken Burns, crossfades, hook card,
   word-by-word captions, progress bar), uploads the MP4 and calls `/api/internal/renders/callback`.
5. Any approved content can be rendered on demand (`POST /api/contents/:id/render`) and downloaded
   (`GET /api/renders/:id/download`); YouTube upload still requires schedule + activation.
