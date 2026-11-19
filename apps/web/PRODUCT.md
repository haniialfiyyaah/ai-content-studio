# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: a solo creator who starts with a vague direction ("a weekly channel explaining databases", "short cat stories") and wants it turned into a running content series without stitching together separate tools for ideas, scripts, visuals, voice, video and scheduling. They work alone, review in short sessions, and need to know at a glance what is waiting on them.

Secondary audiences named in the PRD (affiliate creators, one-off creators, series storytellers, small businesses, teams) use the same Project model and are not designed for first.

## Product Purpose

AI Content Studio turns a creative intention into an editable content Project. A shared AI agent brainstorms, drafts the Creative Kit, proposes concepts, writes scripts and storyboards, and suggests production and publishing settings. The user reviews and edits, approves concepts and videos, and enables only the automations they want.

Success: a creator goes from one sentence to an approved, rendered short video and a publishing plan, and always knows which decisions are theirs.

## Positioning

One agent turns an intention into a whole editable Project, and the user stays in control of every consequential step. Planning starts from the first actionable message with no extra Generate button, but activation, concept approval, video approval, paid-media authorization and publishing are separate, explicit decisions. Neighbouring AI video tools produce a clip; this produces a Project the creator directs, interrupts and reuses.

## Operating Context

- Canonical structure: Account → Projects → Concepts → Concept Versions → Video Attempts → Publishing Jobs.
- A Project is the single container (one video, a finite set, or an ongoing series). It is not a folder, campaign or social account. There is no Ideas Inbox and no Campaign entity.
- Entry points: the Studio home conversation (signed-in `/`), plus Telegram later. `/agent` still exists with older styling and overlaps the home.
- Every Draft, Active, Paused or Stopped Project opens the same Project Detail; status changes available actions, not the screen.
- Each concept has its own Content Detail (script, storyboard, production, publishing).
- Video production: Remotion motion graphics (MVP default, user-initiated browser MP4 export), fal.ai generative footage, ElevenLabs narration, or Hybrid.
- n8n orchestrates the agent and asynchronous jobs; Next.js is the API authority; Supabase stores data and media.

## Capabilities and Constraints

- Concept review actions are Approve and Edit. Video review actions are Approve and Regenerate (plus Revoke).
- Video approval is only possible once an attempt is `ready_for_review`, which requires a verified MP4 upload.
- Activating a Project enables selected automation rules only; it never approves content, authorizes paid media, or grants publishing.
- Paid generation needs a `produce_paid_media` grant and a visible estimate first.
- Editing creates new concept versions; approved versions and delivered media are never rewritten.
- Fixture (non-live) provider output must be labelled as fixture and never presented as live success.
- Agent planning stages shown to the user must reflect real persisted run state, not timed animation.
- Undecided: Telegram linking UX, team roles, analytics depth.

## Brand Commitments

- Name: AI Content Studio. Tagline in the PRD: "Your Idea. On-Brand Creativity. Automated Production."
- Product vocabulary to keep: Studio, Agent, Project, Draft Project, Creative Kit, Concept, Publishing Pack, Automation rule.
- Tone (from user rules): friendly, approachable, clear over decorative.

## Evidence on Hand

- PRD v2.2: `docs/specifications/PRD.md`. UX spec v2.7: `docs/specifications/UX_SPECIFICATION.md`.
- v2.7 interactive prototype and 12 screen PNGs: `docs/design/prototype/`, `docs/design/screenshots/v2.7/`.
- No real customers, testimonials, usage metrics or published videos exist. Do not fabricate any.

## Product Principles

1. Start with an intention: one sentence is enough to begin.
2. Agent-led, user-controlled: the agent proposes, the creator decides every consequential step.
3. One Project, one place: every state opens the same Project, every concept its own detail.
4. Consent is layered and visible: approve, authorize spend and publish are distinct moments.
5. Honest state: real progress, real costs, labelled fixtures.

## Accessibility & Inclusion

Semantic HTML, keyboard reachable controls, visible focus and WCAG AA contrast, per the project UI rules. Mobile-first layouts.
