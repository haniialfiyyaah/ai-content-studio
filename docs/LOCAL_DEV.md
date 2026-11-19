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
| Remotion | Default worker returns explicit fixture; `ACS_REMOTION_LIVE=true` requires Remotion packages |

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
