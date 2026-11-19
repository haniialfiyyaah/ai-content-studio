# Capstone demo smoke — browser Remotion + media

## What this agent verified

| Check | Result |
|---|---|
| Remotion packages / composition with fal footage + narration slots | Implemented |
| Fixture fal → CORS sample `https://remotion.media/video.mp4` | Implemented |
| Fixture ElevenLabs → CORS sample `https://remotion.media/audio.wav` | Implemented |
| Supabase `renders` upload path (minimal MP4 + signed URL) | Run `node scripts/smoke-m4-storage-upload.mjs` |
| Full WebCodecs encode in agent environment | **Not available** (no Chrome WebCodecs session here; Playwright Chromium not installed per request) |

## Manual browser export (you run this)

Prerequisites: `pnpm dev`, Cloud Supabase env in `apps/web/.env.local`, Chrome 94+.

1. Sign in.
2. Create/open a project → ensure a concept with script/scenes exists.
3. **Approve** the working concept version.
4. Create an active **`produce_paid_media`** grant for the project (Settings / grants UI or API).
5. Open **Content → Production**.
6. Click **Export MP4 in browser**.
7. Confirm progress reaches upload, then **Open for review**.
8. On `/videos/[attemptId]`, play the signed MP4.
9. **Approve** the video attempt; confirm status becomes approved (revoke still works).

Browser export defaults to a short 480p caption clip. Preview and fal/ElevenLabs media are off until opted in, because in-browser encode is slow on typical laptops. Vercel Sandbox remains the later unattended option and is not provisioned.

## Paid live media (do not enable without approval)

| Provider | Demo default | Advisory estimate |
|---|---|---|
| fal.ai | `fal-ai/ltx-video` | **~$0.02 / video** |
| fal quality alt | `minimax/h3-max-turbo/text-to-video` | **~$0.094 for 5s** ($0.01875/s) |
| ElevenLabs | `eleven_flash_v2_5` | **~$0.06 / 1k chars** (advisory; plan/credits apply) |

To go live later: set `ACS_FAL_FIXTURE_MODE=false` + `FAL_KEY`, and `ACS_ELEVENLABS_FIXTURE_MODE=false` + `ELEVENLABS_API_KEY` (optional `ELEVENLABS_VOICE_ID`).

## Demo journey (target)

User idea → Agent planning (fixture or live OpenAI) → concept approval → `produce_paid_media` grant → Content Production export (media prepare + browser Remotion) → review/approve MP4.

n8n WF-02 remains the orchestration contract for unattended/hybrid modes; browser export can run without n8n for the remotion MVP path.
