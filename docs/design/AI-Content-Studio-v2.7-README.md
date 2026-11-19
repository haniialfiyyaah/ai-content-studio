# AI Content Studio — v2.7 design / v2.2 requirements update

- **Prototype:** `AI-Content-Studio-UX-v2.7-Hybrid-Prototype.html` — a standalone responsive HTML simulation.
- **Screenshots:** `AI-Content-Studio-UX-v2.7-Screens/` — visual references for the updated screens (not final visual styling).
- **UX specification:** `AI-Content-Studio-UX-v2.7-Screen-Specification.md`.
- **Product requirements:** `AI-Content-Studio-PRD-v2.2.md` — adds FR-25 for managed OpenAI/BYOK.
- **Technical design:** `AI-Content-Studio-TDD-v2.2.md` — adds provider preference/secret/usage models, APIs and backend gateway policy.
- **n8n design:** `AI-Content-Studio-n8n-Workflow-Design-v1.1/` — all 11 workflows; adds per-request provider policy checks and routing; 129 proposed design nodes (not deployed/importable workflows).

### What changed visually
The Project and Content Detail screens remain from v2.6; the Publishing calendar, Automation, Library and Settings management hierarchy are restored from v2.5; the Schedule Video form remains v2.6. A new AI Providers page lets you preview managed vs BYOK mode and mocked connection lifecycle.

### What did *not* change
The first-activation content approval requirement, independent authorization gates for expensive production/publishing, Project-unified lifecycle, shared n8n agent, Next.js domain authority and Supabase persisted history.

### Safety and simulation
The HTML demo is not connected to accounts, OpenAI, n8n, Supabase, Telegram, fal.ai, ElevenLabs or publishing APIs. **Do not enter a real API key in a prototype.** A BYOK Connect control changes in-memory demo state only. Actual user keys would go through a secure backend gateway in implementation.
