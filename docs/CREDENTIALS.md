# Credentials & integrations

## Required for local auth/data

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `supabase status` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `supabase status` |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase status` (server only) |
| `ACS_INTERNAL_SERVICE_TOKEN` | Generate a random string for n8n ↔ API |

## Optional providers (fixture mode when empty)

| Variable | Provider | Notes |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI managed | Studio-managed billing path |
| BYOK key | OpenAI | Stored encrypted via Settings; never logged |
| `FAL_KEY` | fal.ai | Video generation |
| `ELEVENLABS_API_KEY` | ElevenLabs | Narration |
| `TELEGRAM_BOT_TOKEN` | Telegram | Agent + notifications |
| YouTube OAuth pair | YouTube | Publishing |

Ask before spending money or publishing externally. Fixture adapters must identify themselves as fixtures in responses and logs.
