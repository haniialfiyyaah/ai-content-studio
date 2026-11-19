# Architecture Decision Records

## ADR-001: Local-first infrastructure

- **Date:** 2026-03-19
- **Decision:** Use Supabase CLI + Docker Compose n8n for local development; keep env-driven config for future cloud deploy.
- **Why:** Matches approved plan (1A); no cloud credentials required to start.

## ADR-002: Refined creative-studio visual system

- **Date:** 2026-03-19
- **Decision:** Preserve UX v2.7 IA/flows; ship a refined studio aesthetic (expressive type, atmospheric surfaces) instead of the prototype lavender/Inter look.
- **Why:** Approved plan (2A); UX spec states visual design is not final.

## ADR-003: pnpm monorepo with workspace packages

- **Date:** 2026-03-19
- **Decision:** Follow TDD repo shape (`apps/web`, `apps/render-worker`, `packages/*`, `n8n/`, `supabase/`).
- **Why:** Clear ownership boundaries; domain logic shared by public/internal APIs.

## ADR-004: Fixture-first provider adapters

- **Date:** 2026-03-19
- **Decision:** Adapters support live + fixture modes; fixture mode is explicit and never reported as live success.
- **Why:** Enables full journey testing without paid credentials.
