# Renderer (Railway)

Remotion service that turns scene images + narration into the final 1080×1920 Short
(Ken Burns motion, crossfades, hook card, word-by-word captions, progress bar).

- `POST /render` (Bearer `RENDERER_TOKEN`) → 202; renders, PUTs the MP4 to the signed
  `uploadUrl`, then POSTs `{ renderId, ok, durationSeconds | error }` to `callbackUrl`
  with header `x-renderer-token`.
- `GET /health`

Railway: root directory `apps/renderer`, builder Dockerfile, variables `RENDERER_TOKEN`
(same value as Vercel), optional `RENDER_CONCURRENCY` (default 2). Preview locally with `npm run studio`.
