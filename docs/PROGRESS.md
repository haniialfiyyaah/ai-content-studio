# Implementation Progress

Last updated: 2026-11-19

## Milestone status

| Milestone | Status | Notes |
|---|---|---|
| M1 Foundation | **done** | Monorepo, schema+RLS, auth, studio shell, Overview |
| M2 Shared Agent | **partial** | Fixture sync path **Verified**; live Agent→n8n→gateway next |
| M3 Projects / Content / Activation | **done** | Lifecycle, Creative Kit, Content Detail, launch gates |
| M4 Video production | **fixture** | Job pipeline **Verified**; Remotion/fal/ElevenLabs not live |
| M5 Automation / Publishing / Telegram | **partial** | UI + APIs + n8n JSON; live OAuth/Telegram blocked |
| M6 Docs / hardening | **in progress** | Specs + architecture + traceability landed; Playwright pending |

## Documentation (this pass)

- `docs/specifications/{PRD,TDD,N8N_WORKFLOWS,UX_SPECIFICATION}.md` — full copies of latest Master Package specs
- `docs/design/` — v2.7 prototype, screenshots, history prototypes
- `docs/ARCHITECTURE.md`, `docs/TRACEABILITY.md`, portfolio `README.md`

## Verified locally (API smoke)

1. Signup / login / Overview
2. Agent message → Draft Project (fixture)
3. Concept approve + initial-launch + activate
4. Render blocked without grant → grant → job → claim/complete → video approve
5. BYOK mode without key → `BYOK_KEY_INVALID`

Unit tests: 18 passed (`@acs/domain` 14 + `@acs/integrations` 4).

## Next implementation priorities

1. Real Web Agent → n8n WF-A1/A3 → AI Provider Gateway (disable sync-only fixture when webhook configured)
2. Secure BYOK decrypt inside `/api/internal/ai/execute`
3. Real Remotion rendering beyond stub
4. Import/test n8n workflows end-to-end
5. Playwright + remaining providers

## Blockers

| Item | Notes |
|---|---|
| Provider keys | OpenAI/fal/ElevenLabs/Telegram/YouTube not supplied for live |
| Docker/Supabase | Prefer `supabase start --ignore-health-check -x logflare,vector` |
| n8n compose | Use `docker-compose` (Homebrew may lack `docker compose` plugin) |

## Decisions

See [DECISIONS.md](DECISIONS.md).
