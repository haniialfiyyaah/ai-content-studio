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

## ADR-005: Specs and design vendored under docs/

- **Date:** 2026-11-19
- **Decision:** Copy latest PRD/TDD/n8n/UX specs into `docs/specifications/` and keep v2.7 prototype + screenshots under `docs/design/`. Full 49-image archive stays in the external Master Package.
- **Why:** GitHub-portable documentation without bloating the repo with historical binaries; Master Package remains read-only.

## ADR-006: OpenAI only via Next.js AI Provider Gateway

- **Date:** 2026-11-19
- **Decision:** n8n workflows call `/api/internal/ai/*` over HTTP; no n8n OpenAI Chat Model credentials.
- **Why:** BYOK isolation, single policy enforcement, no key duplication in workflow execution data.

## ADR-007: BYOK decrypt only inside the gateway process

- **Date:** 2026-11-19
- **Decision:** `prepareOpenAiExecution` decrypts BYOK with `ACS_CREDENTIAL_ENCRYPTION_KEY` inside Next.js. n8n sends `ownerId` only — never plaintext keys. Fixture managed allowance exhaustion is skipped when `fixtureMode` is true (no spend).
- **Why:** Prevents key leakage into n8n execution data; keeps consent/billing invariants enforceable in one place.

## ADR-008: Supabase Cloud fallback when local disk is exhausted

- **Date:** 2026-11-19
- **Decision:** Prefer local Supabase CLI. If Docker/disk blocks local Postgres, create a cloud project via Supabase MCP or Dashboard, copy URL + anon + service_role into `apps/web/.env.local`, and apply migrations with the CLI against the linked project. No paid upgrades without explicit authorization. Do not commit project refs or secrets.
- **Why:** Unblocks auth/API verification without buying infra; keeps credentials out of git.
