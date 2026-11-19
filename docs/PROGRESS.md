# Implementation Progress

Last updated: 2026-11-19

## Milestone status

| Milestone | Status | Notes |
|---|---|---|
| M1 Foundation | **done** | Monorepo, schema+RLS, auth, studio shell, Overview, Docker n8n compose, docs |
| M2 Shared Agent | **done** | AI gateway (no BYOK→managed fallback), agent → Draft Project, WF-A1/A3/04 |
| M3 Projects / Content / Activation | **done** | Lifecycle, Creative Kit, Content Detail, launch selection, activation gates |
| M4 Video production | **done (fixture)** | Render + grant gate, claim/complete, video approve, provider fixtures, WF-02/08 |
| M5 Automation / Publishing / Telegram | **partial** | Publishing calendar/composer; all 11 n8n JSONs; internal stubs. Live Telegram/OAuth not verified |
| M6 Hardening / Tests / Docs | **partial** | Unit tests green; local smoke journey verified; Playwright not yet added |

## Verified locally (Supabase + Next.js + fixtures)

1. Signup / login / me / overview
2. Agent message → Draft Project
3. Concept create + approve
4. Activate blocked when launch empty/unapproved (`INITIAL_LAUNCH_NOT_READY`)
5. Initial-launch selection + activate → `active` + snapshot
6. Render blocked without spend grant (`BUDGET_AUTHORIZATION_REQUIRED`)
7. `produce_paid_media` grant → video job queued
8. Internal claim → complete (fixture) → `ready_for_review`
9. Video attempt approve
10. BYOK mode without key → `BYOK_KEY_INVALID`

Unit tests: 18 passed (`@acs/domain` 14 + `@acs/integrations` 4).

## How to run

```bash
pnpm install
# apps/web/.env.local from supabase status keys (see .env.example)
supabase start --ignore-health-check -x logflare,vector
pnpm n8n:up   # optional
pnpm dev
```

## Fixture / blocked

| Area | Status |
|---|---|
| OpenAI / fal / ElevenLabs live | Fixture unless keys + fixture flags off |
| Remotion encode | Worker stub only |
| Telegram / YouTube | Stubs; need credentials |
| n8n live import/run | JSON ready; not CI-executed |
| Playwright e2e | Not added |

## Decisions

See `DECISIONS.md`.
