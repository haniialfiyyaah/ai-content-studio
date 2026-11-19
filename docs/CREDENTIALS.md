# Credentials & integrations

Never commit real secrets. Use `apps/web/.env.local` (gitignored). Template: [`.env.example`](../.env.example).

## Required for local auth/data

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `supabase status` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `supabase status` |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase status` (server only) |
| `ACS_INTERNAL_SERVICE_TOKEN` | Shared with n8n; random string |
| `ACS_CREDENTIAL_ENCRYPTION_KEY` | 32-byte key material for BYOK encryption |
| `ACS_EXECUTION_CONTEXT_SECRET` | Signed execution context |

## OpenAI

| Mode | Where | Notes |
|---|---|---|
| Managed | `OPENAI_API_KEY` in Next.js env | Used only when user mode is `managed` |
| BYOK | Settings UI → encrypted `ai_provider_connections` | Never in n8n; never logged |
| Fixture | `ACS_AI_FIXTURE_MODE=true` | Default for local without keys |

Set `ACS_AI_FIXTURE_MODE=false` for live managed calls.

## Optional providers (fixture when empty / flag true)

| Variable | Provider |
|---|---|
| `FAL_KEY` | fal.ai |
| `ELEVENLABS_API_KEY` | ElevenLabs |
| `TELEGRAM_BOT_TOKEN` | Telegram |
| YouTube OAuth pair | Publishing |
| `RENDER_WORKER_URL` / `RENDER_WORKER_TOKEN` | Remotion worker |

## n8n

Configure in n8n env / UI (see [n8n/credentials.example.md](../n8n/credentials.example.md)):

- `ACS_API_BASE_URL`
- `ACS_INTERNAL_SERVICE_TOKEN`

**Do not** add OpenAI, fal, or ElevenLabs credentials to n8n for this architecture.

## Safety

- Ask before spending money or publishing externally.
- Fixture adapters must identify themselves (`fixture: true`) and must not claim live success.
- Exported workflow JSON must not contain real tokens (spot-check before commit).
