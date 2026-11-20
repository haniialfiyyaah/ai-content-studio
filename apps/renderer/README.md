# Renderer (Railway)

Remotion service that turns scene images + narration into the final 1080×1920 Short
(Ken Burns motion, crossfades, hook card, word-by-word captions, progress bar).

- `POST /render` (Bearer `RENDERER_TOKEN`) → 202; renders, PUTs the MP4 to the signed
  `uploadUrl`, then POSTs `{ renderId, ok, durationSeconds | error }` to `callbackUrl`
  with header `x-renderer-token`.
- `GET /health`

Railway: root directory `apps/renderer`, builder Dockerfile, variables `RENDERER_TOKEN`
(same value as Vercel), optional `RENDER_CONCURRENCY` (default 1; use 2+ only with ≥2 GB RAM) and `RENDER_PARALLEL_ENCODING=true` on large instances. Preview locally with `npm run studio`.

Memory: defaults target a ~512 MB instance (720×1280 via `RENDER_SCALE=0.6667`, `RENDER_X264_PRESET=veryfast`,
concurrency 1, no parallel encoding). On ≥1.5 GB set `RENDER_SCALE=1` for 1080×1920.
