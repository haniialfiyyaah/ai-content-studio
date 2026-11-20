---
name: content-video
description: AI Content Studio's spec for "content" Shorts (9:16, 15–45 s) — formats, beat-by-beat pacing, layouts, captions, audio, safe zones, the generation schema WF-01 must output, and how to build/test the Remotion template in apps/renderer. Use when changing video generation prompts, the scene/beat schema, the Remotion composition, or when judging video quality.
---

# Content videos (AI Content Studio)

A **content video** teaches, tells or sells one thing fast. It must feel *edited*,
not like a slideshow. Target: YouTube Shorts / Reels / TikTok, 1080×1920, 30 fps,
**18–40 s**, voice-led. Load `remotion-best-practices` for Remotion APIs; this
skill decides *what* the video should be.

## 1. The five rules (quality bar)

1. **Hook in 1.5 s.** First frame already shows the topic + a bold claim/question.
   Never open on a logo, title card alone, or "In this video…".
2. **Something changes every 1.5–2.5 s** — a new beat, a zoom punch, a text pop,
   an element entering. A single still image may hold ≤ 3 s.
3. **Voice + captions + music.** Voice-over drives timing; captions are
   word-synced; music bed at ~-20 dB under the voice (−14 LUFS overall). Silent
   video is a failure state, not a style.
4. **One idea per beat, max ~7 words on screen** besides captions.
5. **Payoff + CTA.** End with the answer/result, then a 1.5 s end card
   ("Follow for part 2", "Link in bio", project handle).

## 2. Formats (pick one per content from the Creative Kit + idea)

| format | use for | beat pattern |
|---|---|---|
| `explainer` | tips, how-to, coding, concepts | hook → problem → 2–4 steps/points → payoff → CTA |
| `listicle` | "3 ways…", "5 tools…" | hook → numbered items (1 beat each) → best one → CTA |
| `story` | characters, mini-series, narratives | hook moment → setup → twist → resolution → tease next |
| `compare` | X vs Y, before/after, myths | hook → side A → side B → verdict → CTA |
| `product` | affiliate, reviews | problem → product reveal → 2–3 benefits → proof/price → CTA |

## 3. Beat schema (what WF-01 must generate)

A content has `format` and 7–11 **beats** (≈ 2–4 s each; the render keeps up to 12). Arc: hook → promise →
value beats → **payoff** (second-to-last beat delivers what the hook promised) → **CTA** (specific, loops back to
the hook). About 3 of 4 beats use `background: "ai"`; `design` only for code / compare / stat, never twice in a row.
Narration is written in the Creative Kit narrator voice (persona, style, signature phrases); WF-01 runs an
**editor pass** that checks hook, payoff, CTA, voice and consistency before saving. Scene images are drawn when
content is approved (storyboard) and the render reuses them. Every beat:

```jsonc
{
  "layout": "hook | statement | points | code | compare | stat | quote | product | image | cta",
  "narration": "words spoken during this beat (drives duration)",
  "visual": "image prompt for the background/illustration (Creative Kit art style, no text in image)",
  "headline": "≤ 6 words shown big (optional for image/quote)",
  "points": ["≤ 4 short items"],            // points, listicle
  "code": "≤ 8 short lines",                 // code (explainers)
  "left": "…", "right": "…",                 // compare (✗ / ✓)
  "stat": "73%",  "statLabel": "of devs…",  // stat
  "emphasis": ["words to color-pop in captions"],
  "motion": "push-in | pull-out | pan-left | pan-right | punch",
  "transition": "cut | slide | zoom | flash | wipe",  // into this beat
  "background": "ai | design"                         // AI image or code-drawn (§5)
}
```

Rules for the generator:
- Beat 1 is always `hook`; last beat is `cta`. Use ≥ 3 different layouts.
- Narration total 45–110 words; each beat 6–20 words.
- `visual` describes ONE composition the image model can draw; reuse a
  recurring subject (same character/product) across beats for continuity.
- Coding topics: prefer `code`, `compare`, `points`; stories: `image`, `quote`;
  products: `product`, `stat`, `points`.
- Language/tone from the Creative Kit; never invent statistics — `stat` only
  when the idea/references support it, else use `points`.

## 4. Layouts (renderer contract — `apps/renderer/src/remotion`)

All layouts share: full-bleed background image with motion (Ken Burns / punch),
a darkening gradient for legibility, accent color from the project, and respect
**safe zones**: keep text out of the top 220 px and bottom 420 px
(YouTube/TikTok UI). Captions sit at ~62 % height.

| layout | foreground |
|---|---|
| `hook` | headline in huge type, word-by-word pop, slight shake/zoom punch |
| `statement` | headline card slides up, key word highlighted (rough-notation) |
| `points` | items enter one by one on the narration, check/number icons |
| `code` | dark code card, lines type in, highlighted line pulses |
| `compare` | split card ✗ left / ✓ right, divider wipes in |
| `stat` | big number counts up, label below |
| `quote` | speech bubble / quote card over the illustration |
| `product` | product image cut-out (reference upload) + 2 callout tags |
| `image` | illustration only (story moments), stronger motion |
| `cta` | end card: handle/project name + "Follow for more" + arrow |

Transitions alternate (`slide`, `zoom`, `flash`, `wipe`, `cut`) — never the same
transition three times in a row. Optional light-leak overlay on 1–2 cuts.

## 5. Image generation (scene backgrounds)

Images are backgrounds **under** the layout, not the whole message. Bad fit =
the picture fights the overlay or tells a different story than the narration.

**Visual identity (per project, in the Creative Kit, generated once):**
- `visualStyle` — one art direction reused verbatim in every prompt
  (e.g. "flat vector illustration, thick outlines, soft grain").
- `palette` — 3–5 named colors that match the project accent.
- `recurringSubject` — the character/product/mascot that appears across
  beats, described concretely (e.g. "a curious orange tabby kitten with a blue
  collar"). Leave empty only for abstract topics.

**Per beat `visual` (WF-01):** one concrete scene that *illustrates the beat's
narration*: subject + action + setting + mood + camera framing. Use metaphors
for abstract/technical ideas (two puzzle pieces that both fit = "matches both
schemas") — never draw screens, code, charts, documents or anything with text.

**Prompt builder (app, `sceneImagePrompt`) — layout aware:**

| layout | composition |
|---|---|
| hook, image, story moments | bold subject large in frame, dramatic angle, subject in lower 60 % |
| points, code, compare, stat, statement, quote | calm, low-detail background related to the topic; main subject small in the **lower third**; upper 55 % mostly empty/soft for the overlay |
| product | the product hero shot, centered, clean background (reference image when available) |
| cta | soft, celebratory background with the recurring subject waving / looking at camera, lots of empty space |

Always append: the style string, palette, recurring subject (when the beat
features it), "vertical 9:16", and "no text, no letters, no numbers, no logos,
no UI, no watermark".

**AI image or code-drawn? (per beat, decided by the writer):** each beat sets
`background: "ai" | "design"`. Use `ai` when the picture carries meaning (hook,
story moments, product, the recurring character). Use `design` when the text
layout *is* the content (code, compare, stat, most points/statement beats):
the template draws an animated branded background (palette orbs, dot grid,
shapes) — cleaner, consistent, and no image cost. Aim for ~40–60 % `ai`.

**Character reference (automatic, during generation):** when the plan sets
`recurringSubject`, WF-01 calls `/api/internal/generation/identity` right after
the plan (stage "Designing your character") and the app draws a clean
full-body reference sheet (on first render for older projects) and stores it as project reference #1
(`★ Main character (AI)`, `apps/web/src/lib/server/identity.ts`). Scene images
are then image-conditioned on it (OpenAI edits / Kontext) so the subject stays
identical across beats and videos. Users can only *regenerate* it (Assets tab)
or replace it by uploading their own reference.

**Model:** one primary model per project for consistency (OpenAI
`gpt-image-2.6-flare` family *or* fal Flux); the other is fallback only. Reference
uploads → image-conditioned generation (OpenAI edits / Flux Kontext).

## 6. Captions

TikTok-style pages of 1–3 words, centered, heavy weight (900), uppercase,
white with dark stroke; the active word scales 1.15→1 and turns the accent
color; `emphasis` words get an emoji/underline pop. Timings come from the
ElevenLabs alignment (fallback: even timing). Never cover the beat headline —
when a layout shows a headline the captions move down to the 70 % line.

## 7. Audio

- Voice: ElevenLabs `eleven_multilingual_v2`. Per project, the first render
  picks the account voice whose labels best match Creative Kit `voice` /
  audience / tone (`rankVoices`; Voice Library voices skipped — free plans get
  402) and saves it to `projects.voice_id` so the whole series sounds the same
  (`ELEVENLABS_VOICE_ID` = global fallback). The
  narration of all beats concatenated → one MP3 with word timestamps; beat
  durations = their words' time span (+0.2 s padding).
- Music: royalty-free bed (`MUSIC_URL` / library), looped, −20 dB, fades
  in/out, ducked under voice.
- SFX (optional, quiet): whoosh on slide/zoom transitions, pop on points/stat.

## 8. Production constraints

- Render server: Railway, Remotion `renderMedia`, concurrency 1. 1080p needs
  ≥ 1.5 GB RAM; on 512 MB use `RENDER_SCALE=0.6667` (720p).
- Images: 1 per beat (OpenAI `gpt-image-2.6-flare` → `gpt-image-2` → `gpt-image-1.5` → mini → fal → reference → gradient).
  Generate in parallel; same seed/style string for consistency.
- File: H.264, CRF ~25, AAC 128k → 3–8 MB.

## 9. How to test a change

1. Edit the composition in `apps/renderer/src/remotion` (keep the props
   contract above; old `scenes` props must keep working).
2. Preview: `cd apps/renderer && npm run studio`.
3. Real sample: build props from a stored render (scene images + captions) and
   `npx remotion render src/remotion/index.ts Short out.mp4 --props=props.json`.
4. Judge against §1. If any rule fails, fix the template or the generator
   prompt (`n8n WF-01 › 01-08 Write contents`) before shipping.
