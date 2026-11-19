# Local Development

## Prerequisites

- Node.js 20+
- pnpm 11+
- Docker (Colima/Docker Desktop) + `docker-compose`
- Supabase CLI (`brew install supabase/tap/supabase`)

## First-time setup

```bash
cd ai-content-studio
pnpm install
cp .env.example apps/web/.env.local

supabase start --ignore-health-check -x logflare,vector
# Copy API URL, anon key, service_role key into apps/web/.env.local

pnpm db:reset   # optional: re-apply migrations + seed
pnpm n8n:up
pnpm dev
```

| Service | URL |
|---|---|
| App | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54323 |
| n8n | http://localhost:5678 |

## Fixture vs live AI

| Setting | Effect |
|---|---|
| `ACS_AI_FIXTURE_MODE=true` | Gateway returns deterministic completions |
| `ACS_AI_FIXTURE_MODE=false` + `OPENAI_API_KEY` | Managed live OpenAI via Next.js gateway |
| Settings → BYOK | User key encrypted in DB; never put in n8n |

n8n should **not** store OpenAI credentials. Configure only:

- `ACS_API_BASE_URL` (e.g. `http://host.docker.internal:3000`)
- `ACS_INTERNAL_SERVICE_TOKEN` (must match Next.js)

Import workflows from `n8n/workflows/` (see `n8n/workflows/README.md`).

## Agent paths

| Condition | Behavior |
|---|---|
| `N8N_WEBHOOK_BASE_URL` empty | Sync gateway planning inside Next.js (**verified**, fixture when no live key) |
| `N8N_WEBHOOK_BASE_URL` set | Dispatch to n8n WF-A1 webhook (import + activate WF-A1/A3 first) |
| BYOK | Settings → store key → Test → switch mode → gateway decrypts in-process (**verified** fixture) |
| Remotion | Default: browser export (`ACS_REMOTION_RENDER_BACKEND=browser`). Content → Production → Export MP4. Worker not required. Optional legacy: `legacy_worker` + `ACS_REMOTION_LIVE=true` + render-worker. Do not set `vercel_sandbox` until authorized. |
| Playwright | `pnpm exec playwright install chromium` then `ACS_E2E=1 pnpm test:e2e` |
| n8n token drift | Token must match `ACS_INTERNAL_SERVICE_TOKEN` exactly. After `.env` changes: `docker-compose up -d --force-recreate n8n`. Optional aliases via `ACS_INTERNAL_SERVICE_TOKEN_ALIASES` only (no hardcoded legacy tokens). Production rejects aliases. |
| Local Supabase disk full | Prefer Supabase Cloud via MCP (`create_project` → copy URL/anon/service_role into `apps/web/.env.local` → `supabase db push` / link). See ADR-008. |
| `EMFILE: too many open files` | Cursor often inherits macOS soft `maxfiles=256`. Use `pnpm dev` (raises `ulimit` + Watchpack polling). Or: `ulimit -n 10240` then restart. |

## Useful commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Next.js |
| `pnpm db:start` / `db:stop` / `db:reset` | Supabase |
| `pnpm n8n:up` / `n8n:down` | n8n via docker-compose |
| `pnpm --filter @acs/domain test` | Domain unit tests |

## Specs & design

- Specs: [specifications/](specifications/)
- Design: [design/README.md](design/README.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)

Master Package at `../AI-Content-Studio-Complete-Package-v2.7` is read-only reference (full 49-screen set lives there).
