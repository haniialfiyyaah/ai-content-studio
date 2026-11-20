# Progress

## v2.7 rebuild — 2026-11-20 (branch `rebuild/v2.7`)

Fresh start against the v2.7 package (prototype, screen spec, PRD/TDD v2.2) with the
owner's simplified flow. Previous implementation is preserved on `backup/pre-v2.7-rebuild`.

| Area | Status |
|---|---|
| Supabase schema (16 tables, RLS, Realtime) | **Live** on `utkjotbrvnfsgpjbwrzh`; dev data wiped, users + Telegram link kept |
| UI (Overview, Projects, Project workspace + agent panel, Content detail, Content, Videos, Publishing calendar, Automation, Library, Settings, auth) | **Built**, prototype CSS, live updates |
| Generation (WF-01, OpenAI structured output, live progress screen) | **Built**; server path smoke-tested against real DB |
| Review → approve all → schedule → activate | **Smoke-tested** end to end (temp user, cleaned up) |
| Multi-scene render (fal clip per scene → fal compose → Storage) | **Built**, not run live (needs `FAL_KEY`) |
| YouTube connect / scheduled upload / analytics | **Built**, not run live (needs Google OAuth client) |
| Telegram start-project + notifications | **Built** (WF-A2, WF-06) |
| n8n | 8 new workflows created; **unpublished until the app is deployed** (legacy 13 archived) |
| Checks | domain 10 + integrations 4 tests pass · `tsc` clean · `next build` ok · lint 0 errors |

## Go-live checklist

1. Vercel env: `FAL_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ACS_CREDENTIAL_ENCRYPTION_KEY`,
   `N8N_WEBHOOK_BASE_URL`, `ACS_API_BASE_URL` (optional `ELEVENLABS_API_KEY`, `FAL_VIDEO_MODEL`).
2. Google Cloud: enable YouTube Data API v3, OAuth redirect `${ACS_API_BASE_URL}/api/integrations/youtube/callback`
   (app in Testing mode → add your Google account as a test user).
3. Deploy `rebuild/v2.7` (merge to `main`).
4. Publish n8n: WF-01, WF-02, WF-00, WF-03, WF-06, WF-A1, WF-A2 (WF-04 already active).
5. Smoke: create a project on Overview → watch the live generating screen → approve → schedule → connect YouTube → activate.

## Known limits

- Scene clips are assumed 5 s each when composing; models with other lengths still work but timing is approximate.
- Narration is optional (ElevenLabs); without it videos are silent footage.
- Only YouTube is a publishing destination (Instagram/TikTok shown as "Soon").
