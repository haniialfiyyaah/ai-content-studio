# AI Content Studio

AI-powered content creation, video production, and publishing automation.

**Specs (read-only):** `../AI-Content-Studio-Complete-Package-v2.7`  
**Product:** PRD/TDD v2.2 · n8n workflows v1.1 · UX v2.7

## Quick start

```bash
pnpm install
cp .env.example apps/web/.env.local
supabase start
# copy API URL + anon/service keys into apps/web/.env.local
pnpm db:reset
pnpm n8n:up
pnpm dev
```

See [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) and [docs/PROGRESS.md](docs/PROGRESS.md).

## Workspace

| Path | Role |
|---|---|
| `apps/web` | Next.js App Router UI + APIs |
| `apps/render-worker` | Remotion render worker |
| `packages/domain` | Authorization, transitions, envelopes |
| `packages/schemas` | Zod contracts |
| `packages/agent-contracts` | Allowlisted agent tools |
| `packages/integrations` | Provider adapters + fixtures |
| `n8n/workflows` | Importable workflow JSON |
| `supabase/migrations` | Schema, RLS, storage |

## Principles

- Activate ≠ approve concept ≠ approve video ≠ paid spend ≠ publish
- BYOK never silently falls back to managed OpenAI
- n8n orchestrates; Next.js owns auth, claims, and state
