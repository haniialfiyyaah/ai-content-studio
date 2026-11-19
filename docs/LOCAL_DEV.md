# Local Development

## Prerequisites

- Node.js 20+
- pnpm 11+
- Docker Desktop
- Supabase CLI (`brew install supabase/tap/supabase`)

## First-time setup

```bash
cd ai-content-studio
pnpm install
cp .env.example apps/web/.env.local
# Fill NEXT_PUBLIC_SUPABASE_* from `supabase status` after start

supabase start
pnpm db:reset
pnpm n8n:up
pnpm dev
```

- App: http://localhost:3000
- Supabase Studio: http://127.0.0.1:54323
- n8n: http://localhost:5678

## Fixture mode

When provider keys are empty or `ACS_*_FIXTURE_MODE=true`, adapters return deterministic fixtures and never claim live provider success.

## Useful commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Next.js app |
| `pnpm db:start` / `db:stop` | Supabase local |
| `pnpm db:reset` | Apply migrations + seed |
| `pnpm n8n:up` / `n8n:down` | Docker n8n |
| `pnpm typecheck` | Typecheck workspace |

## Notes

- Master Package at `../AI-Content-Studio-Complete-Package-v2.7` is read-only reference.
- Do not put real secrets in Git. See `docs/CREDENTIALS.md`.
