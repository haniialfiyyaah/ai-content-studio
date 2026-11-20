# Costs

What AI Content Studio spends money on, per video and per month, and the
settings that control it. **Prices are approximate (checked Nov 2026) — verify on
each provider's pricing page before budgeting.** Amounts in USD.

## TL;DR

| | Typical |
|---|---|
| One 20–30 s Short (images + voice + render) | **≈ $0.05 – $0.30** |
| One new project (plan + 4 contents + character) | **≈ $0.03 – $0.10** of text/image generation, before rendering |
| Fixed monthly (infra) | **≈ $5** (Railway Hobby) + your n8n Cloud plan; Vercel/Supabase on free tiers |
| 30 Shorts / month, all-in | **≈ $10 – $20** (incl. Railway) |

## 1. Per video (render)

A video has 7–11 beats (about 3 of 4 use an AI image). Only beats with `background: "ai"` cost an image
(content-video skill §5); `design` beats are drawn by the template for free.
Typical: **3–5 AI images per video**.

| Item | Provider / model | Unit price (approx.) | Per video |
|---|---|---|---|
| Scene images (primary) | OpenAI `gpt-image-2.6-flare`, medium, 1024×1536 | check OpenAI pricing (not yet measured) | — |
| Scene images (cheapest fallback) | OpenAI `gpt-image-1-mini`, medium | ~$0.015 / image | $0.05–0.08 |
| Scene images (backup only) | fal Flux dev / Flux Kontext (references) | ~$0.025 / ~$0.04 per image | only on fallback |
| Narration | ElevenLabs `eleven_multilingual_v2` | plan credits; ~300–450 characters per video | free tier ≈ 25–30 videos/month, then plan |
| Composition | Remotion on Railway | included in Railway usage (≈ 1–3 CPU-min) | ≈ $0.00–0.01 |
| Storage | Supabase Storage (MP4 3–8 MB, images ~2 MB each) | free tier 1 GB | ≈ $0 until ~70 videos |
| Telegram delivery | Telegram Bot API | free | $0 |
| YouTube upload + stats | YouTube Data API | free (quota) | $0 |

Re-rendering a video re-generates its AI images (another $0.05–0.30).

## 2. Per project (generation, n8n WF-01)

| Item | Model | Approx. |
|---|---|---|
| Plan: Creative Kit, research angles, title | OpenAI `gpt-5-mini` (n8n) | < $0.01 |
| Contents: N items × 3 options × 7–11 beats + editor pass | OpenAI `gpt-5-mini` (n8n) | ≈ $0.02–0.08 for 4 items |
| Character reference sheet (only if the idea has a recurring subject) | OpenAI image (same model as scenes) | ≈ $0.015–0.06, **once per project** |
| "Generate 3 more", revisions, weekly ideation | `gpt-5-mini` | ≈ $0.01 each |
| Agent chat reply | `gpt-5-mini` | ≈ $0.001 each |

n8n currently uses **n8n's built-in OpenAI gateway credits** for text. They are
limited; for production volume set a Studio OpenAI credential on the
`OpenAI (plan|content|agent)` nodes (then billed to that OpenAI account).

## 3. Fixed monthly infrastructure

| Service | Plan | Cost | Free-tier limits that matter |
|---|---|---|---|
| Railway (Remotion renderer) | Hobby | **$5 / month**, includes $5 usage | renderer needs **≥ 2 GB RAM** for 1080p (`RENDER_SCALE=1`) |
| Vercel (app) | Hobby | $0 | function duration (renders/start up to 300 s), bandwidth |
| Supabase (DB, auth, storage, realtime) | Free | $0 | 500 MB DB, 1 GB storage, project pauses after 7 days inactive |
| n8n Cloud (workflows) | your existing plan | per n8n plan | executions/month (scheduler runs every 1–5 min) |
| Google Cloud (YouTube OAuth) | no billing | $0 | YouTube quota 10,000 units/day ≈ **6 uploads/day** (upload ≈ 1,600 units) |
| ElevenLabs | Free → Starter | $0 → plan price | free ≈ 10k characters/month |
| fal.ai | prepaid credit | only when used | backup image provider |

**n8n executions:** WF-00 (every 2 min), WF-06 (every 1 min) and WF-03 (every
5 min) run constantly — ≈ 66k executions/month even when idle. Check this
against your n8n plan's execution limit; widen the intervals if needed.

## 4. Cost levers (env / settings)

| Lever | Where | Effect |
|---|---|---|
| `OPENAI_IMAGE_MODEL=gpt-image-1-mini` | Vercel | ~3–4× cheaper images, same style |
| `OPENAI_IMAGE_QUALITY=low` | Vercel | cheaper drafts (≈ $0.006/image on mini) |
| More `design` beats | WF-01 writer prompt (skill §5) | fewer AI images per video |
| `RENDER_SCALE=0.6667` | Railway | 720p, less RAM/CPU per render |
| Recurring ideation off / longer interval | Project → Schedule | fewer automatic generations |
| Scheduler intervals | n8n WF-00 / WF-06 / WF-03 | fewer n8n executions |
| Narration off (no `ELEVENLABS_API_KEY`) | Vercel | $0 voice (silent videos — not recommended) |

## 5. Example month

30 Shorts from 6 projects, gpt-image-1-mini, ElevenLabs Starter:

| | |
|---|---|
| 6 projects × ~$0.06 (text + character) | ≈ $0.36 |
| 30 videos × ~4 images × $0.015 | ≈ $1.80 |
| ElevenLabs (~12k characters) | Starter plan |
| Railway Hobby | $5.00 |
| Vercel / Supabase / Google / Telegram | $0 |
| **Total (excl. ElevenLabs plan & n8n plan)** | **≈ $7** |

With the full image models (`gpt-image-2.6-flare` / `gpt-image-2`): measure after the first renders and update this table.

## Where to check current prices

OpenAI (platform.openai.com/pricing) · ElevenLabs (elevenlabs.io/pricing) ·
fal (fal.ai/pricing) · Railway (railway.com/pricing) · Vercel, Supabase, n8n
pricing pages · YouTube quota (console.cloud.google.com → APIs → YouTube Data
API → Quotas).
