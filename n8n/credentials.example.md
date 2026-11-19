# n8n credentials (example only)

Never commit real credentials. Configure these in the local n8n UI or env.

| Credential | Used by | Notes |
|---|---|---|
| `ACS Internal Service Token` | All workflows calling `/api/internal/*` | Header `x-acs-service-token`; matches `ACS_INTERNAL_SERVICE_TOKEN` |
| Telegram Bot | WF-A2, WF-06 | Optional; leave unset for fixture-only Telegram |
| SMTP / Email | WF-06 | Optional |

OpenAI, fal.ai, ElevenLabs, and social OAuth credentials stay in **Next.js** / workers — not in n8n — so BYOK keys never enter workflow execution data.
