# Guided creation flow (v2)

Agreed 2026-11-21. Replaces "one prompt → everything generated". The agent
helps the creator shape a rough idea, the creator stays in control at every
step, and steps run automatically only when the creator chooses so.

Backups of v1: git tag `v1-legacy` / branch `legacy/v1`, database schema
`backup_v1` (full copy of `public`, not exposed via the API), live n8n
workflows in `backups/n8n-v1/`.

All v1 project data was cleared on 2026-11-21 (before phase 2). Snapshot of
everything just before the clear: schema `backup_v2` (tables + list of storage
paths; the files themselves were deleted). Kept: profiles, YouTube connection,
Telegram link.

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
- **Continue there** opens the existing project without generating; its agent
  asks "Want me to turn it into a new content?" [Yes, create it] [Not now].
- **Content duplicates (inside a project):** before new content is made from a
  brief, the code scores it against the project's content (embeddings;
  rephrased same video ≈ 0.85, new idea in the niche ≤ 0.62, distinct contents
  ≤ 0.5). ≥ 0.70 = duplicate → the agent does not generate; it offers 2–3
  different angles as chips (same idea, new hook / situation / format /
  audience) and generates only the chosen one. 0.55–0.70 = close → generate
  with an angle that stands apart. After generation a heads-up is posted when a
  new content still scores ≥ 0.75 against an existing one.

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
- **No overlap after "create a different project":** the concept and pillars
  agents get the similar projects (niche, audience, summary, pillars) and must
  differ. The new concept is scored again in code; ≥ 0.55 → one automatic redo
  (first draft only), after that a heads-up — the creator's own edits are
  never overridden.
- After *Lock setup* the workspace shows a drafting card while the first
  content is written.

## Status model (before phase 2)

Project **status**: Setting up · Draft · **Live** (DB value `active`, schedule
running) · Paused · Stopped. Next to it, **signals** (`lib/server/signals.ts`):
🔔 *Needs you (n)* — ideas / setup steps waiting for a confirm · ⏳ *In
progress* — generating, drawing or rendering · 📅 *Next upload* · ⚡
*Auto-approve* / ✋ *Manual* (`projects.auto_approve`). The Projects page
filters by them.

A project is **saved only once the agent made its concept**; setup drafts
without one are hidden from lists, ignored by the duplicate check and deleted
after an hour.

**Removing content:** before images or a video exist → **Remove** (gone; kept
quietly so it is never suggested again). After → **Hold** (`contents.on_hold`:
never published until resumed, later content moves up a slot) or **Reject**
(discarded, never published). No "Skip", no "Rejected ideas" list.

## Content setup (phase 2) — decisions, round 3

- **Auto setup** toggle on the start box (default off). On = concept → kit →
  pillars → lock → content concept → **storyboards** run by themselves; every
  step still shows; it stops at the storyboards. A **similar project always
  stops** to ask (one decision card in the main area: Continue there / Create a
  different project / View). After the lock a **"Yeay, your project is
  ready!"** pop-up appears live; **Generate content** starts by itself after a
  countdown (5 s auto, 8 s manual — the lock was already the confirmation);
  **Wait** stops it and leaves a ready card with the button. A message to the
  agent at that point becomes the brief for the content concept.
- Model output for setup steps is trimmed to fit, never rejected; a failed
  save frees the agent and shows Retry. Only an
  "⚡ Auto" tag is shown when on — nothing when off. (Auto for later steps: TBD.)
- No status tags, Approve & schedule or production tabs until the content
  setup is done.
- After the lock the setup is **read-only**: click the project name for the
  brief (concept, kit, pillars, guardrails, format).
- Steps: Project setup → **Content concept** → Storyboards → Images & video.
- **Content concept** (WF-05 task `plan`): the agent decides single vs series
  and, for a series, the style — *daily* (Day 1, Day 2… for challenges /
  routines / countdowns), *episodic* (connected, order matters) or
  *standalone* (related, independent) — with one line why. Each card: title,
  hook, description, hashtags (content language). Stored as `contents` (status
  idea, `label` = Day n / Episode n) + `projects.content_plan`. **Stops** for
  the creator to check; refine through the chat (✏️ per card). No per-content
  approval.
- Next: storyboards (scenes + script + sketch images) → stop → images → video.
- Hide agent sits in the agent header; phones get a sticky Project / Agent switch.
- **Storyboards** (content setup step 2, decided round 6 — sketches dropped):
  "Continue to storyboards" queues one WF-01 run per content (kind
  `storyboard`): the concept stays locked, writer + editor write the script and
  scenes (series context so each ending teases the next). As soon as a script
  lands, **every scene's image is drawn** (project engine; frames saved one by
  one so they appear live). Each scene card: image (click → its description),
  heading, narration in quotes, ✏️.
- **Refine = one scene at a time.** ✏️ pre-fills "Change Day 2 scene 3: …"; the
  setup agent (WF-05 task `scene`) rewrites only that scene (narration,
  on-screen text, shot), the script is rebuilt from all narration, and only that
  image is redrawn — locked to the scene text, same style/palette/engine, with
  the neighbouring scenes' images + the character as references. No scene named
  → the agent asks which one.
- Steps: Project setup → Content concept → Storyboards → **Video** (next).
- **Step dots are clickable for viewing**: finished steps open read-only (setup
  steps inside the setup; Project setup / Content concept via `?view=`), the
  current step returns to work. The ready pop-up has no Wait: the project
  setup shows behind it and the content concept is generated when the
  countdown ends. Each sketch frame shows its own loader while its storyboard
  is written or rewritten.
- **Video** (content step 3): "Continue to video →" on the storyboards (enabled
  once every script and image is done) approves every content and renders it
  with the existing pipeline (storyboard images reused; narration, captions,
  motion, end screen via the Remotion renderer on EC2). Video view: one card per
  video with live status (waiting → preparing voice & images → composing →
  ready), player, Download, Retry. Finished steps (incl. storyboards) can be
  viewed read-only. Publishing comes next.
- **Skip / Restore** per content (content concept cards and storyboards):
  status `skipped` = set aside, kept visible (dimmed, struck-through) with
  Restore; never storyboarded or rendered. Every skip / restore is posted to the
  agent chat as the creator's message. (`removed` stays for "gone, remembered
  for duplicates".) Changes to the content concept (only in that step — it is
  locked from the storyboards on) update the active cards in place; skipped
  cards are never touched and the agent never brings them back. The **Continue to video** bar sits at the top (sticky).
- **Images carry no text**, so text changes never redraw: a ✏️ scene change
  redraws the image only when the shot (visual) changed; narration / on-screen
  text changes are text-only.
- **Series numbering on skip / restore** (Day N, Episode N, Part N — theme labels
  untouched): the active videos are renumbered in order, then WF-05 task
  `renumber` fixes only the words — numbers in titles / hooks, "Day N" in
  narration / on-screen text, and each video's teaser so it points to the new
  next one. Text only, no redraws; concept and storyboard steps.

## Round 7 additions

- Scene images **flip on hover** (desktop; tap on touch) to the scene description.
- **Change all scenes of one video** (✏️ "Change scenes" on the video): the
  storyboard is rewritten with the creator's note; the **content concept stays
  locked**. Images whose shot didn't change are **reused** (frames remember the
  shot text they were drawn from) — only new shots are drawn.
- **Make this video** per storyboard (approve + render just that one). The bar
  button reads **"Ready — create all videos"** (or "create the other N") and
  never re-makes a video that is made or in progress.
- **Add content** mid-way (concept and storyboard steps, button or chat): WF-05
  task `more` writes only NEW cards (no repeats of current or skipped ones);
  labels continue; on the storyboard step their storyboards + images start
  right away.
- **Archive** (header): status `archived` (`archived_from` remembered) — stops
  scripts, image drawing (checked per frame), renders (even mid-render; the
  callback is ignored), scheduled uploads; hidden from lists (Projects →
  Archived filter). **Unarchive** returns to the previous status (live comes
  back as paused); nothing restarts by itself.
- **Auto switch next to every continue button**: setup / concept = keep going
  without stopping (concept → storyboards); storyboards = **Auto video**
  (`projects.auto_video`: videos start by themselves once every storyboard is
  done).
- **Ready pop-up: Not now** stops the countdown and turns auto off; an inline
  "Your project is ready" bar with Generate content stays.
