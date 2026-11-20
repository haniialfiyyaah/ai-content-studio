# AI Content Studio

One idea in → a reviewed, scheduled series of AI-generated YouTube Shorts out.

**Flow:** Overview prompt → project generates (live progress) → review content by picking AI options →
approve all → schedule → connect YouTube → activate → videos render automatically (scene by scene)
and upload at each slot. Telegram can start projects and notifies you when videos are ready.

| | |
|---|---|
| App | Next.js 16 (`apps/web`), design from the v2.7 prototype |
| Data | Supabase Postgres + Storage + Realtime (`supabase/migrations`) |
| Orchestration | n8n Cloud (`docs/ARCHITECTURE.md`) |
| AI | OpenAI (n8n), fal.ai video + compose, ElevenLabs narration (optional) |

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill values
pnpm dev:web
pnpm test:unit
```

Docs: `docs/ARCHITECTURE.md` (system + queue model + workflow ids), `docs/PROGRESS.md`
(status + go-live checklist), `docs/DECISIONS.md` (ADRs).
