# Guided creation flow (v2)

Agreed 2026-11-21. Replaces "one prompt → everything generated". The agent
helps the creator shape a rough idea, the creator stays in control at every
step, and steps run automatically only when the creator chooses so.

Backups of v1: git tag `v1-legacy` / branch `legacy/v1`, database schema
`backup_v1` (full copy of `public`, not exposed via the API), live n8n
workflows in `backups/n8n-v1/`.

## Principles

- **Show → refine or continue.** Every stage shows its result, asks "want to
  refine anything?", and continues on the creator's word (button or chat).
  Refining is a chat message (or a targeted button) that rewrites only that
  stage.
- **Setup always stops** (first time for a project): Discovery → Concept →
  Creative Kit → Pillars & guardrails. Nothing is generated before the
  creator understands and agrees with the setup.
- **Production stops only when auto-approve is off** (default: off).
  Auto-continue and auto-approve are the same setting.
- **Single and series run the same flow** — only the waiting time differs.
- **No wasted generation:** cheap things first (text, wireframes), expensive
  things (images, video) only after a confirm.

## Stages

| # | Stage | Output | Stops? |
|---|-------|--------|--------|
| 0 | Similar check | runs first, in code (embeddings): a similar project (score ≥ 0.55, or the agent judges 0.35–0.55) → ONE question: continue there, or create a different project? No other questions — details are edited on the concept with ✏️. Nothing similar → straight to the concept. | only when similar |
| 1 | Concept | niche / theme, audience, goal, language, title, one-line summary | always |
| 2 | Creative Kit | tone, narrator persona, voice, visual style, palette, recurring character, format, opening style, ending style | always |
| 3 | Pillars & guardrails | 3–5 pillars (from the concept), 2–4 guardrails | always |
| 4 | Single or series | agent proposes, creator confirms. **Single:** one idea (title, description, caption, hashtags, hook type). May override the project setup for that idea. **Series:** the series plan — premise, arc, episode list (title + logline), how episodes connect (connected story or related-but-separate). One confirm for the whole plan, no per-episode approval. | auto-approve off |
| 5 | Reference assets | character, backgrounds, props, the creator's own photo | shown, continues |
| 6 | Storyboard | per content: scenes + script, shown as free wireframe cards (9:16 frame, text/subject boxes, heading, shot icon, duration — drawn from the scene data, no model cost). Title + short description up front, details behind. ✏️ on a scene = refine that scene in chat. Series storyboards arrive one by one from a queue; reviewing is optional. | auto-approve off |
| 7 | Scene images | full images per scene. 🔁 redraw a single scene. | auto-approve off |
| 8 | Video | render, then publish at the slot | — |

**While waiting** (series plan, reference images or storyboard — whichever
comes first) the agent asks: where to publish, when (schedule), and
auto-approve on/off.

## Redraw rules (stage 7)

A redraw fixes a bad image; it can never change the story or the look.

1. The scene's content is locked to the storyboard text (subject, action,
   framing). A short note ("brighter", "closer") is allowed; changing *what
   happens* is a storyboard refine instead.
2. Same visual style, palette, character reference and engine as the batch.
3. Already-accepted neighbour scenes are passed as references ("match these
   exactly in style, lighting and character").
4. A cheap vision check compares the result with the scene text and a
   neighbour; on drift it redraws once more automatically.

## Duplicate / similar topics

- Discovery: the agent gets the creator's existing projects (title, niche,
  summary) and flags a similar one → "continue *X*?" (only when it looks
  similar).
- Ideas (stage 4+): every idea the creator ever had is remembered (title, hook,
  angle). New ideas too close to an existing one are rewritten. Phase 2 adds
  vector search in Supabase for this.

## Autopilot (replaces "recurring ideation")

After a project's first content, the creator can turn on Autopilot: it finds
and makes new content with no stops, from idea to published.

- At most **one** Autopilot per project; a **schedule is required**.
- Modes: **Same topic** (new ideas from the pillars), **Trending** (new trends
  within the niche — needs a trend source, paid feature), **Series
  continuation** (next episodes of the arc).
- One generation at a time per project; new work waits in the queue. A
  one-time "generate more" is blocked while a generation is running.
- **Safety window:** an Autopilot video finishes hours before its slot; the
  creator gets a Telegram message with Skip / Publish. No answer = publish.
- **Auto-pause** after 2 failures in a row, with an alert.

## Monetization hooks

Free = manual approve. Paid = Autopilot, trending mode, more redraws.

## Build phases

1. **Discovery + setup stops:** discovery chat with the similar-topic check;
   Concept → Creative Kit → Pillars & guardrails, each refine-or-continue.
   New setup workspace view. After setup, the existing idea generation runs
   (bridge until phase 2).
2. **Single/series plan, wireframe storyboard with per-scene refine,**
   publishing / schedule / auto-approve questions while waiting, idea memory.
3. **Scene-image stop with consistent redraw, auto-approve, Autopilot**
   (safety window, auto-pause).

## Phase 1 implementation

- `projects.status` gains `setup`; `projects.setup_stage` ∈ discovery |
  concept | kit | pillars | done; `projects.setup_busy` (agent working);
  `projects.concept` jsonb. `creative_kit` stays the flattened kit every
  downstream step reads (concept's audience/language are mirrored into it).
- n8n **WF-05 Setup Agent** (webhook `acs-setup`): loads
  `/api/internal/setup/context`, runs the stage task (`chat` | `concept` |
  `kit` | `pillars`) and posts to `/api/internal/setup/complete`.
  - `chat`: replies in the creator's language; action = ask | propose (idea is
    clear → generate the current stage) | refine (feedback for the current
    stage) | continue | similar (projectId of a similar project).
- Buttons call `/api/projects/:id/setup` (`continue`, `refine`, `start-new`).
- After Pillars & guardrails → setup_stage `done`, status `generating`, and the
  existing WF-01 runs as `ideation` (it skips the plan step and uses the kit).

### Phase 1 UI decisions (feedback rounds 1–2)

- Setup keeps the **split screen**: agent chat on the side, the current stage
  card in the main area (a full-page chat was tried and dropped — too many
  confirmations for a simple start).
- No discovery questions. The similar check comes first; the only possible
  question is "continue there, or create a different project?". Then the
  concept is generated directly; details are edited with ✏️.
- **Every button press is also a chat message** ("✅ Concept looks good…").
- **Refine per field:** ✏️ on any field / point pre-fills "Change the <field>: ".
- **Language:** chat and setup cards use the app language (English for now);
  the concept's *Content language* (one language or a mix) only drives scripts.
- Pillars and guardrails are shown as two lists of short points.
- After *Lock setup* the workspace shows a drafting card while the first
  content is written.
