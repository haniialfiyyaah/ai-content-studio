# AI Content Studio — Product Requirements Document

**Version:** 2.2  
**Status:** Finalized product requirements baseline — implementation phased by value and dependencies  
**Companion:** `AI-Content-Studio-TDD-v2.1.md`  
**Product category:** Agent-driven content planning, creative production, and publishing automation

> **Your Idea. On-Brand Creativity. Automated Production.**
>
> This document specifies the **complete intended product**. Phases describe implementation priority and capability dependencies. A requirement appearing in a later phase is still part of the product vision.

## 1. Executive summary

AI Content Studio helps individuals, creators, affiliate marketers, businesses and teams turn a creative intention into an actionable content **Project**. Users speak naturally to a shared AI creative agent from the web dashboard or Telegram; the agent brainstorms, researches, recommends content and references, drafts scripts and visual storyboards, and proposes settings for generation and publishing. The resulting Project can contain one video, a finite collection of posts, or an ongoing channel or series.

The user can review and change Project details, Creative Kit (the product-facing name for the versioned Brand Kit), references, individual content concepts, provider choices and automation rules at any time. Every Draft, Active, Paused or Stopped Project opens the same canonical Project experience; status changes permissions and available actions rather than requiring a separate review wizard. Every concept has its own complete Content Detail view. **Project activation** starts only the automations the user enabled. Content concepts use **Approve / Edit** as their principal review actions; video outputs use **Approve / Regenerate**. Downloads and external publishing follow separate permissions. A Project is an execution context, not a folder, campaign prerequisite, or social-media account.

The creative engine develops each approved concept into a structured storyboard and Visual Production Plan. Users can select **Remotion Motion Graphics**, **fal.ai Generative Video**, or **Hybrid** production, compare attempts, and preview estimated charges before paid operations. n8n coordinates the shared AI agent and asynchronous workflows. Next.js provides the user experience and API authority; Supabase stores durable data and assets. The system maintains detailed revisions, approvals, spending, execution history, and publication records.

## 2. Product principles

1. **Start with an intention.** A goal, an unfinished thought, a product photo, a script, a topic, or an ongoing creator identity is enough. Sending the first actionable creative request starts agent planning directly, without a second Generate Project confirmation.
2. **Agent-led, user-controlled.** The agent proposes a coherent Project; the user can adjust it and remains the authority for consequential actions.
3. **Project is the single organizing container.** An affiliate campaign, one-product promotion, niche channel, creative experiment, and connected series are all Projects with the same core capabilities.
4. **No unnecessary organization.** A new independent idea naturally becomes a new *draft Project*. A user working within an existing Project can add concepts or revise its settings without creating another Project.
5. **One agent, multiple surfaces.** Dashboard and Telegram use shared identity, project context, persisted conversations, and application tools.
6. **Activation is not blanket consent.** Activating a Project enables selected automation rules; it does not silently authorize paid generation, approve concepts/videos, or grant publishing rights.
7. **Positive, minimal review.** The primary concept actions are **Approve** and **Edit**. The primary video actions are **Approve** and **Regenerate**. Content may remain unapproved until the user chooses to act.
8. **Visual quality requires real direction.** AI provides a storyboard, asset preparation, composition, motion and timing—not only text plus a style keyword.
9. **Provider choice is explicit.** Users can compare Remotion, fal.ai and hybrid outcomes using immutable attempts and transparent estimates.
10. **Automation can be controlled.** Pause, resume, stop and later reactivate workflows with predictable handling of queued, running and published work.
11. **Editing never rewrites history.** Approved versions and delivered media remain attributable to exactly the settings and assets used.
12. **Channels are destinations, not Projects.** Creation does not require a social account; one Project can publish to one or many authorized destinations.
13. **Accuracy, rights and cost are visible.** Sources, product claims, licensed assets, provider limits, estimated charges and real outcomes are represented faithfully.

## 3. Problem and opportunity

Creators must repeatedly move between brainstorming, product research, scripts, visuals, voice-over, video tools, review, channel scheduling and trend analysis. Existing AI text can be generic, generated visuals can drift from source products, template-based footage can be stiff, and end-to-end automations often hide the decision that caused publication. People also frequently begin with a purpose rather than a detailed script.

AI Content Studio combines **conversational creative planning**, **consistent Project context**, **intentional media production**, and **auditable automated delivery**. The value is not merely producing an MP4: it is maintaining a creative operation that a person can direct, interrupt, refine and reuse.

### 3.1 Product goals

- Transform vague or concrete creative goals into understandable editable Projects.
- Support one-off content, multi-content initiatives, continuing channels and episodic series uniformly.
- Use the same agent and project memory in the dashboard and linked Telegram chat.
- Generate relevant, varied content proposals using Project context, optional research and evidence-backed trends.
- Preserve user intent, Brand Kit restrictions and factual accuracy through ideation and revisions.
- Produce visually compelling videos with supplied/generated assets, structured scenes, audio and sensible animation.
- Offer user-selectable Remotion, fal.ai and Hybrid production, with comparison and cost controls.
- Separate Project activation, content approval, video approval and authorized publishing.
- Allow scheduled ideation, approval-driven production and independent publishing schedules.
- Protect work across edits, revocations, cancellations, downloads and external publication.
- Support individual users first and extend to teams, analytics, diverse platforms and advanced media features.

### 3.2 Non-goals and important distinctions

- Project is **not** synonymous with a connected social-media channel; it may publish through many channels.
- A marketing campaign is a **type/purpose of Project**, not a mandatory extra parent or child entity.
- An idea does **not** need an independent, persistent Ideas Inbox. The agent may brainstorm temporarily before saving a draft Project.
- A **Publishing Pack** is metadata prepared for one content item/destination, not a Project-level campaign.
- Remotion is a programmable composition/rendering system, not a generative video model; fal.ai is a model platform, not one fixed model.
- n8n does **not** replace authorization, approval enforcement or durable application state.
- No provider-generated asset, approved Project or uploaded reference alone grants permission to publish publicly.

## 4. Target users and jobs to be done

| User | Job | Example outcome |
|---|---|---|
| Solo creator | Find and develop content from a vague direction | Agent proposes a weekly educational channel with a content lineup |
| Affiliate creator | Explore products and generate accurate promotional stories | Product recommendations, supplied product references, multiple reviewable ads |
| One-off creator | Turn one reference into one complete video | Single-product Project with one concept and a one-time publishing option |
| Series storyteller | Maintain consistent recurring characters and plots | Episodes, character references, ordered publishing plan |
| Personal/technical brand | Maintain identity across formats and content | Recurring educational clips with consistent voice/style |
| Small business | Coordinate product launches and promotional calendars | Brand Kit, schedule, multiple channels and approval rules |
| Team/agency | Delegate preparation and control release | Roles, review assignments, connected accounts and audit history |

## 5. Terminology and data hierarchy

| Term | Definition |
|---|---|
| **Studio** | The signed-in application and combined creative workspace; team/tenant support may be layered on later |
| **Agent** | Shared AI creative collaborator accessed through the dashboard or Telegram, with authorized tools and persisted context |
| **Project** | A creative initiative and automation context: goal, Brand Kit, content plan, references, production choices and workflows |
| **Draft Project** | Editable, saved proposal produced from a new intention; automatic workflows are not active |
| **Active Project** | A Project whose selected automation rules can execute subject to per-action gates |
| **Creative Kit / Brand Kit** | User-facing Creative Kit and its versioned creative-context data: language, audience, tone, style, permitted facts, restrictions and reference assets |
| **Concept** | One planned content item in a Project; the Project may contain one, many or an ongoing backlog |
| **Concept version** | Immutable snapshot of an edited concept, effective Brand Kit, creative plan and publishing draft |
| **Visual Production Plan** | Structured scenes, assets, layouts, motions, audio, transitions and output parameters |
| **Video attempt/output** | Rendered media derived from a specific approved concept version and provider configuration |
| **Publishing Pack** | Title, description, caption, hashtags, CTA, thumbnail and platform-specific publishing metadata |
| **Publishing job** | Planned or attempted delivery of one exact video output to one authorized destination |
| **Automation rule** | Independently configurable recurring ideation, production behavior, publishing slots or notifications |
| **Connected account** | Authorized social destination identity, independent of the Project itself |

**Canonical structure:** `Account → Projects → Concepts → Concept Versions → Video Attempts/Outputs → Publishing Jobs`.

**Supporting relations:** `Project → Brand Kit + Assets + Agent Conversations + Automation Rules + Preferred Destinations`. A conversation may begin before a Project exists and becomes linked to the draft Project when one is created. A concept belongs to exactly one Project in the initial model. One output may have several destination-specific publishing jobs. There is **no required Campaign entity or Ideas Inbox entity**.

### 5.1 What Project means, regardless of purpose

| Example input | Resulting Project | Content / automation shape |
|---|---|---|
| “I want to create content for affiliate products” | **Affiliate Products** | Brainstormed product angles, recommended lineup and schedules; may enable recurring ideation |
| “Create content for this product” plus photo | **Mini Fan Promotion** | One concept, source photo and facts, one render and optional one-time publication |
| “Start a cat storytelling channel” | **Cat Stories** | Series context, characters, episodes, continuing rules and channel preferences |
| “Create a 11.11 campaign” | **11.11 Promotion** | Time-bounded objective, multiple promotional concepts and planned release slots |
| “Explain databases for new developers” | **Database Shorts** | Educational concepts and recurring publishing if enabled |

No extra level is introduced solely because a Project resembles a campaign or channel. Users can rename a Project, expand a one-off Project into a series, or disable recurrence without migrating its content.

## 6. User experience and primary journeys

### J-01 — New idea → draft Project → activation

1. After signing in, the user lands on **Overview**, which exposes current work and an idea composer. The user may also open a new Agent conversation directly.
2. Sending a **first actionable creative request** starts agent planning automatically. No separate Generate Project button or approval gate exists for *draft planning*. If the intent genuinely cannot be understood, the agent asks a narrow clarifying question and continues in the same conversation.
3. The user can inspect **real, durable planning stages** and partial prepared sections while the agent researches, drafts Creative Kit defaults, proposes content concepts and suggests automation. A timed animation is not a progress source of truth.
4. The agent saves a **Draft Project**, links the originating conversation and makes it available in the same **canonical Project Detail** used by Active, Paused and Stopped Projects. The user may keep conversing while reviewing/editing the Project.
5. Project Detail exposes Project Overview, Content, Creative Kit, Automation, Publishing, Assets and Activity. A separate mandatory Project Review wizard or setup-completion flag is **not** part of the product.
6. Opening any content concept leads to its own **Content Detail** with full script/narration, storyboard/scenes, assets, Publishing Pack and immutable version history. Users edit or approve the **exact version** there.
7. The user selects which concepts are intended for the **initial launch**; others may remain as unselected drafts. First activation requires **at least one selected concept and approval of the current working version of every selected concept**, plus valid Project settings.
8. **Activate Project** is a contextual Project action showing the rules to be enabled and any missing cost/destination permissions. Activation enables only explicitly selected rules and never implies paid-media or external-publication permission. Existing Project tabs stay unchanged after activation.

### J-02 — One supplied product → one Project and one concept

1. User provides a product reference and says “Create a video for this product.”
2. Agent proposes one Project and one concept, with verified/supplied product facts and missing-fact warnings.
3. User edits the Brand Kit, assets, concept, narration and visual storyboard as needed.
4. User **approves the concept**, selects Remotion, fal.ai or Hybrid, and authorizes any charge above policy limits.
5. A video is produced and offered for **Approve / Regenerate**, download and optional publishing.
6. The Project may remain one-off with no recurring automation, or later gain additional concepts.

### J-03 — Existing Project → new content

1. User opens a Project in the dashboard or selects it in chat: “Add three ideas to Affiliate Products.”
2. Agent loads Project context, sources, existing concepts and automation preferences.
3. New concepts are drafted **inside the same Project**, avoiding unnecessary duplication.
4. User edits/approves each concept independently; approved versions can produce independent video outputs.
5. Recurring ideation uses the same Project, if enabled, without forcing a new Project per run.

### J-04 — Agent continuity across dashboard and Telegram

1. User securely links a Telegram identity to a Studio account.
2. User starts a conversation in Telegram, shares a picture and develops a Project.
3. User opens the web dashboard and resumes the **same conversation** or opens the draft Project the agent produced.
4. Messages, assets, decisions, suggested actions and tool results persist against a user and optionally a Project; interface-specific actions render appropriately.
5. Permissions and confirmations are identical regardless of where an action originated.

### J-05 — Approve concept → produce video → approve output

1. Concept is shown with original request, latest version, hook, script, Publishing Pack and Visual Production Plan.
2. User chooses **Edit** to change it or **Approve** to authorize its current immutable version.
3. If configured, approval creates a production job; where a paid generation exceeds approved limits, production waits for explicit cost confirmation.
4. n8n coordinates reference preparation, image/footage generation if selected, voice-over, rendering and quality validation.
5. User previews the output and chooses **Approve** or **Regenerate**, including possible provider/model changes.
6. Each attempt remains identifiable, and approving a different attempt does not overwrite earlier exports or posts.

### J-06 — Publish, schedule, or simply download

1. An approved output can be downloaded without connecting a social account.
2. To schedule/publish, user chooses one or more accounts, channel-specific metadata, privacy/visibility and time, or a configured authorized queue.
3. An unavailable, expired, disconnected or insufficiently scoped destination produces a visible **blocked** result—not a misleading successful schedule.
4. n8n publishes eligible jobs at their authorized times and records provider results/URLs.
5. The user can stop future publishing or revoke approval; already-completed platform posts and downloaded files cannot be retroactively recalled.

### J-07 — Pause, edit, resume, revoke, stop

1. User pauses a Project, a specific automation rule, or scheduled publishing.
2. New automatic claims stop; queued work is held, and in-flight external work is cancelled only if the provider supports it.
3. User can edit the Project or any content after activation/approval; new versions do not silently alter existing videos or scheduled posts.
4. User may withdraw approval for future work. Previously published content remains a historical output; deletion/unpublish is a separate authorized action where supported.
5. Resuming requires clarity about missed occurrences and pending jobs. Stopping disables recurring automation indefinitely, without deleting Project history.

### J-08 — Series and channel operations

1. User requests a recurring narrative or creator channel.
2. Agent proposes recurring characters, style references, episode order, niche strategy and a content calendar.
3. Approved reference profiles and completed episode summaries inform later ideas.
4. Publishing rules preserve sequence when enabled; missing previous episodes hold later ones safely.
5. The same Project can publish to several separately connected destination accounts.

## 7. Functional requirements

Requirements apply to the whole product. **Priority phases are specified separately in §11.** “Must” denotes intended behavior when that capability is implemented, not permission to skip security checks before its phase.

### FR-01 — Accounts, API-first authentication and identity

- Provide registration, sign-in, recovery, sign-out, session management, profile and optional social identity providers via Supabase Auth.
- Authentication starts at the application API boundary (e.g., Next.js route handlers), not by exposing business credentials, service roles or private state mutations to the browser.
- Verify requests, enforce account ownership/team permissions and use least-privilege access and database RLS.
- Support login via securely managed cookie-based sessions, logout and token invalidation/revocation handling.
- Link external messaging identities and publishing accounts separately; a Telegram chat ID is **not** automatically a Studio account.
- Maintain actor-attributed audit events for activation, approvals, permissions, publishing and other consequential actions.
- After authenticated sign-in, open **Overview** by default; expose registration, recovery and sign-out without requiring any Project to exist.

### FR-02 — Shared conversational AI agent

- Provide the same underlying agent capabilities to the dashboard chat and authenticated Telegram bot.
- Support natural-language brainstorming, Project creation/refinement, content generation, research, visual direction, automation explanation, issue diagnosis and guided actions.
- Preserve agent conversations, message attachments, tool outcomes, source references, linked Project context and resumable history across surfaces.
- Resolve whether a user intends a **new Project** or an **addition/change to an existing Project** from explicit context; allow user correction and avoid guessing when an existing Project may be modified.
- Present proposed changes and request confirmation for destructive, paid, account-linking, approval, activation or external publishing actions as required by policy.
- Do not allow instructions inside product pages, uploaded references or external research to override tool permissions.
- Provide concise agent summaries and editable structured outputs; conversational interaction complements, not replaces, accessible UI controls.
- Keep agent memory separated by user and permitted Project scope; support history export/deletion under retention policies.
- A conversation may start **unlinked**; once tied to a Project, it has at most one active Project context. Multiple conversations may reference one Project. Context changes must be explicit; never silently interpret the mention of another Project as a switch.
- Permit opening the Agent from Draft, Active, Paused and Stopped Project views and from Content Detail. Agent changes follow the same server-authorized version/approval rules as direct edits.

### FR-03 — Agent-driven Project planning and creation

- Accept user intentions as text, pictures, links, briefs, scripts, optional voice notes and incomplete goals.
- Brainstorm possible directions, niches, products, stories, audiences, formats, content quantities and publication cadence before committing to a plan.
- Where product recommendations are requested, show sources, availability limitations, affiliate restrictions and the distinction between a suggestion and a verified product fact.
- Produce a draft Project summary with **name, objective, audience, Brand Kit, initial concepts, reference assets, suggested production modes, publishing preferences, and disabled-by-default or explicitly opted-in automation rules**.
- Allow direct form editing and agent-guided adjustments to every proposed setting without discarding the initial intent.
- Treat a new independent creative intention as a new draft Project by default. A user explicitly asking to contribute to an existing Project uses that Project.
- No global Ideas Inbox, forced categorization step or standalone Campaign setup is necessary. Temporary unsaved brainstorming may exist in conversation history.
- The **first actionable message** in a new chat launches preparation automatically, asynchronously and idempotently; do not require a distinct Generate or Accept Draft action. Keep conversation continuity if preparation is slow, interrupted or awaiting necessary clarification.
- Expose meaningful stages such as understanding, research, creative direction, concepts and configuration; persist progress and show available partial results without inventing percentages.

### FR-04 — Project lifecycle and configuration

- Maintain `draft`, `active`, `paused`, `stopped`, and `archived` lifecycle states; Project deletion is a separate controlled operation.
- A Project owns creative identity, Project brief, context/assets, concepts, selected provider defaults, automation rules, preferred destinations, and relevant conversation links.
- Support independent content, series, time-limited promotions, channels, niche experiments and single-item projects using the same structure.
- Allow changing any setting after activation, with impact preview for future jobs and immutable snapshots for already-approved work.
- **Activate Project** enables only configured automations; do not retrospectively consume every historical approved concept or missed schedule without explicit policy.
- **Pause Project** suspends automatic claims and holds not-yet-started scheduled actions; **Resume** restores selected enabled rules with a declared missed-run policy.
- **Stop Project** disables ongoing automation indefinitely until explicitly reactivated; **Archive** hides it from the active workspace while preserving history as required.
- Allow manual creative work in Draft/Paused/Stopped Projects where safe; scheduled automatic workflows remain disabled.
- The same Project Detail and functions are accessible in **all lifecycle states**; status controls which actions can proceed, not which review layout is used. There is no separate `approved` Project state or mandatory Project-setup step.
- First activation requires one or more initial-launch concepts selected and all their **current** versions approved. Unselected brainstormed concepts may stay drafts. Reactivating a previously active Project revalidates current rules/permissions without incorrectly treating the initial-launch review as a new mandatory wizard.

### FR-05 — Creative Kit (versioned Brand Kit) and reusable creative context

| Field/group | Expected use |
|---|---|
| Content language | Default `id` or `en`, expandable to more languages |
| Brand/creator display name | Optional attribution, introduction or sign-off |
| Audience and niche | Intended viewer, region, interests, expertise and goals |
| Tone and voice | Playful, documentary, educational, calm, energetic and custom phrasing |
| `do_say` | Approved supplied facts, product claims, names or phrases |
| `dont_say` | Prohibited claims, framing, sensitive topics, competitors and phrases |
| Visual identity | Palette, typography direction, logo placement, backgrounds, framing, safe areas |
| Brand assets | Logos, product photos, illustrations, approved music, B-roll and templates |
| Reference profiles | Product, character, object or world/style continuity references |
| Output preferences | Video aspect ratio, default length, provider, narration and subtitle style |

- Project setup may begin with partial information; agent-suggested values must be distinguishable from confirmed user-provided facts.
- The agent **prepares useful defaults**; structured fields offer stable, extendable options for language, tone, audience, objective, content structure and visual direction, with optional custom descriptions and reference uploads. The user should not have to manually complete a long form to get a draft.
- An explicit user selection takes precedence over agent recommendations for future drafts. Invalid/obsolete predefined options require migration or a visible fallback, never silent substitution.
- Concepts inherit defaults but may override permitted fields; hard restrictions cannot silently be relaxed.
- Each approved concept version stores an immutable **effective creative-context snapshot**. Brand Kit edits apply to future drafts, not existing render histories.
- Reusable multi-brand asset/profile libraries and team-level Brand Kits are supported as the product expands.

### FR-06 — Project content plan and concepts

- A Project may contain one concept, several planned concepts, or continuously generated content.
- Represent concept title, original user intent, hook, structured script/story, references, audience, CTA, publishing pack, production plan and review state.
- Support independent items, linked episodes, batches, scheduled queues and user-selected sequencing.
- Support manual concept creation, agent-created concepts, batch ideation and recurrence-created concepts.
- Maintain a content plan/calendar with concept progression, approved versions, available renders and intended publishing destinations.
- Track **selected for initial launch** independently of a concept being Draft, Pending Review or Approved. Selection is a scope choice, not an approval/rejection action; subsequent post-activation content does not automatically require a new Project activation.
- Preserve who/what originated each concept (web, Telegram, scheduled AI, human edit, imported reference) and distinguish source facts from generated suggestions.

### FR-07 — AI collaboration actions

| Agent action | Behavior |
|---|---|
| **Brainstorm** | Explore the user's broad goal and propose Project directions, products, topics and a content lineup |
| **Ideate** | Generate new distinct content concepts from Project context or a research brief |
| **Develop** | Transform a rough concept into a complete creative brief and storyboard |
| **Refine** | Improve hook, story, language, pacing, clarity or visual direction while preserving intent |
| **Explore variations** | Present alternative approaches and styles without overwriting the current version |
| **Revise** | Apply explicit user feedback to the current working concept or Project proposal |
| **Translate/localize** | Produce per-language variants and appropriate captions/audio metadata |
| **Research/recommend** | Explore products and trends with provenance, freshness and uncertainty |
| **Explain/manage** | Summarize schedules, permissions, estimates and failures; propose authorized configuration changes |

AI output is structured, validated, inspectable and editable. Unverified product specifications, prices, endorsements, legal claims or purported trends must not be fabricated. Evidence is linked where applicable. Creative suggestions must not be represented as sourced factual assertions.

### FR-08 — Visual Production Plan and storyboard

- Each production-ready concept contains a **scene-level Visual Production Plan**, not merely a text script and style adjective.
- Scene data covers creative purpose, scene order, duration, narration segments, on-screen text, subtitle timing, media assets, composition/layering, camera framing, motion presets, transitions and brand rules.
- Specify asset-source strategy: supplied photo/video; AI-generated still/keyframe; designed graphics; stock/licensed asset; generative video clip.
- Support reference fidelity for supplied products and recurring characters and show discrepancies/uncertainty to the user.
- Let users preview storyboard cards and manually edit text, media selection, composition and supported motion before approving.
- Video generation must use validated renderer instructions; never execute arbitrary agent-generated code.
- Permit scene-level style diversity and editable emphasis/pacing to avoid monotonous animated text.

### FR-09 — Asset management and generation

- Upload, catalog and reuse product pictures, character art, screenshots, logos, audio, videos, fonts and permissible external references.
- Generate visual stills, backgrounds, storyboards, keyframes and scene references when requested or selected in a production mode.
- Store provider/model, prompt, input references, generation lineage, rights/licensing notes, cost and review status.
- Allow replacing or regenerating individual assets without deleting older approved outputs.
- Honor media rights and commercial use terms, including attribution requirements and retention settings.
- Provide intentional fallback compositions where references are absent or unavailable; communicate if quality cannot be maintained.

### FR-10 — Video production methods and comparison

- Offer three user-facing choices: **Motion Graphics (Remotion)**, **AI-Generated Video (fal.ai)** and **Hybrid (fal.ai footage + Remotion composition)**.
- For fal.ai, offer eligible models compatible with requested image/video mode, duration, resolution, aspect ratio, reference handling, audio behavior and budget. Do not imply every fal.ai model has the same capabilities.
- User can select a provider/model or request a recommendation, inspect expected visual behavior and authorize generation when required.
- Preserve a common approved concept and storyboard across render comparisons so users can fairly evaluate different methods.
- Produce distinct versioned render attempts with preview, status, output file, provider details, seed/settings when available, quality checks, and estimated/actual cost.
- Remotion uses developer-authored reusable scenes/layouts, meaningful motion, layered visual assets and synchronized audio—not unimplemented AI animation prose.
- Hybrid mode may combine generated clips, overlays, text, graphics, narration, subtitles and platform formatting.
- Support future aspect ratios, scene templates, multi-scene composition, style libraries and cinematic/stylized generation.

### FR-11 — Narration, sound and captions

- Use ElevenLabs as an initial speech provider behind a replaceable adapter.
- Respect the effective content language (initially Indonesian and English), user voice preferences, pronunciation and speaking style.
- Measure actual output audio duration and adjust scene timing or request revision; never invisibly trim narration.
- Support subtitle generation/editing, word/segment timing, accessible contrast and platform-safe placement.
- Support optional background music, sound effects, rights metadata, appropriate mixing and native provider audio handling.
- Allow voice/audio regeneration without silently changing an already-approved rendered video.

### FR-12 — Concept review and versioning

- Primary actions are **Approve** and **Edit**. Other content can remain in its current review state.
- Approve **one immutable concept version**; approval is not permanent blanket approval of the parent concept.
- Editing an approved concept creates a **new working version of the same concept** while older approved versions and downstream media remain unchanged.
- Manual review is the default. Optional automatic concept approval is allowed only under a separately authorized, explicit policy with constraints and spend limits.
- Revoking an approval blocks new downstream claims based on that authorization and requests cancellation of compatible pending work; already completed media/publishing remains an auditable historical outcome.
- Unapproved concepts may remain in the content plan indefinitely without requiring a negative decision.
- Show version history, source inputs, changed fields, review actor/time and downstream dependencies.
- Give each concept a canonical **Content Detail** independent of Project setup, covering overview, script/narration, detailed scene storyboard, assets/provenance, Publishing Pack and immutable versions. One Project-level content list must not substitute for full scene review.
- If a selected initial-launch concept is revised after approval, its new working version requires fresh approval before first activation; an older approved version must not accidentally satisfy the latest-version check.

### FR-13 — Video review, regeneration and versioning

- Primary actions are **Approve** and **Regenerate**; unfinished reviews remain pending.
- Present playback, subtitles/audio, render settings, provider/model, errors, quality flags, estimated/actual cost and lineage.
- Regenerate creates an independent attempt; users may adjust compatible rendering presets, model, or provider. A substantive edit to approved script, verified claims, or storyboard must first create and approve a new concept version.
- Approved render outputs are immutable identifiers. Selecting a newer output does not silently replace an earlier scheduled/published output.
- Manual video approval is default; opt-in automatic video approval requires strict policy, validation and auditable consent.
- Withdrawal of approval blocks future eligible publishing claims and holds/cancels not-yet-started jobs; posted external copies are not retroactively removed.

### FR-14 — Project automation and activation

- Present proposed rules before activation, with toggles, cadence, timezone, sources, output count, budget limits and downstream approval modes.
- Activation starts only opted-in rules; a user may activate with no recurring rules and later enable them. For **first activation**, check that initial launch membership is nonempty, every selected concept’s current working version is approved, and saved Project/rule configuration is valid. Present a concise confirmation in the normal Project context; do not require a separate setup step or approval of the Project entity.
- Expose **Pause, Resume and Stop** at Project level and per-rule controls where meaningful.
- Recurring ideation, event-triggered production and scheduled publishing are distinct workflows. They may share Project settings but not share a single cadence.
- Every automatic operation checks Project/rule state, source version, eligible approval, budget and permissions at execution time.
- Pausing does not revoke existing approved creative decisions; it holds automatic execution until explicit resume or manual authorized action.
- Define missed-run handling when resuming: do not publish stale queued jobs or generate catch-up batches without approved policy.

### FR-15 — Recurring ideation and trend intelligence

- Configure independent daily/weekly/custom recurring generation, time zone, quantity, themes, avoid-list and backlog policies.
- Support **Original**, **Trend-Based** and **Hybrid** strategies.
- When trends are used, collect available source provenance, publication/observation time, region/language relevance, confidence and source limitations.
- Avoid near-duplicate proposals and retain variety across batches and recent posts.
- Generated concepts enter review under the Project unless automatic concept approval was explicitly enabled within a permitted policy.
- Trend-based content must not claim currency without evidence; source-unavailable conditions are visible and may fall back to original-only mode if user permits.

### FR-16 — Scheduled production and quality safeguards

- Concept approval creates a **production intent/event** when production is enabled, not a recurring video-generation schedule.
- n8n coordinates asset readiness, speech synthesis, selected rendering method, validation and result recording.
- Enforce approved input snapshot, budget permissions, job idempotency, concurrency limits and bounded retries.
- Support provider cancellation when possible; show honest `cancel_requested` / `reconciling` states when not guaranteed.
- Validate playable output, format, length, safe areas, missing assets, audio visibility and output link integrity.
- Manual explicitly confirmed rendering is possible without activating recurring Project automation.

### FR-17 — Publishing destinations and plans

- Support authorized connected accounts (YouTube and future TikTok, Instagram and other platforms as APIs permit), including multiple accounts per platform.
- A Project can have preferred destinations, but an individual publication chooses exact account(s), metadata, privacy/visibility and schedule.
- Offer immediate publishing, one-time scheduling, reusable recurring **publishing slots**, queue-based scheduling and manual download.
- Publishing schedule is independent from ideation schedule; a due slot with no approved ready video skips or holds safely.
- Publishing requires video approval, valid destination authorization and explicit publication permission; Project activation alone is insufficient.
- Track blocked, scheduled, publishing, published, failed and uncertain/reconciliation outcomes without false success claims.
- Support series release order, destination-specific requirements, limits and previews.

### FR-18 — Social account connections and authorization

- Ask users to connect social accounts when publishing is requested or through optional Settings; never require connections to brainstorm, create or download.
- Store tokens securely; support OAuth scopes, consent, expiry, reconnect, disconnect, multiple channels and account ownership verification.
- A disconnected/expired account prevents new publishing but does not erase downloaded or previously rendered videos.
- Publishing permissions are scoped to account, Project/team role and authorized content/slot policy.
- Allow users to inspect granted connections and revoke access.

### FR-19 — Telegram as a full agent interface

- Support two-way agent conversation rather than only notifications or idea intake.
- Users can brainstorm Projects, share references, inspect/edit concepts, ask about schedules, manage approved automations and receive relevant status through chat.
- Persist the same user/Project conversation context as the dashboard and allow cross-surface continuation.
- Require secure account linking and sender verification; unlinked Telegram messages are limited to linking/onboarding guidance.
- For rich review, video playback, asset adjustment or authorization, provide deep links to authenticated dashboard screens when Telegram UX is inadequate.
- The agent must present confirmation before activating workflows, authorizing paid work, changing permissions or publishing.
- Support optional notifications (approval-ready video, automation failure, scheduled publish outcome, budget alerts) with user preferences.

### FR-20 — Safe editing, revocation, cancellation and deletion

- Allow editing Project settings and concept text, storyboards, assets and publishing metadata after initial approval.
- Existing approved concept versions, media outputs and publishing-job snapshots never mutate automatically.
- To replace a scheduled output, user explicitly holds/cancels/reassigns the affected job, then selects a newly approved output.
- Revoke concept/video approval for future operations; show whether queued/running jobs were held or cancellation was best effort.
- After publication, distinguish **withdraw approval**, **disconnect**, **unpublish/delete external post**, and **delete local source/output** as different operations.
- Downloaded copies cannot be recalled from a user's device; explain this in the interface.
- Deleting/archiving a Project must consider outstanding jobs, retained audit records, authorized connected accounts and provider media.

### FR-21 — Publication packs and localization

- Generate and edit a **Publishing Pack** per content version, with platform-specific title, description, caption, hashtags, CTA, language, privacy, tags, thumbnail and alt text where supported.
- Keep publishing metadata traceable to the approved output and destination-specific snapshot.
- Support Indonesian (`id`) and English (`en`) creative outputs initially, then translation/localization into more languages and voices.
- Distinguish interface locale from content language and subtitle/audio language.
- Product claims remain grounded after translation; adaptations must preserve intent, legal constraints and user-supplied facts.

### FR-22 — Collaboration, permission roles and governance

- Extend to teams using roles such as owner, admin, editor, reviewer and viewer; support invitation, shared Projects, comments, assigned approvals and activity feed.
- A team member must not publish to a colleague's private connected account without valid delegated authorization.
- Separate permissions to edit, activate, approve concepts, approve video, spend money, connect accounts, schedule and publish.
- Maintain audit history and tenant-aware data isolation when introducing shared workspaces.

### FR-23 — Analytics, optimization and continuous learning

- Measure concept approval rate, output quality feedback, generation spend/retries, workflow reliability, publishing delivery and channel performance.
- Obtain authorized platform analytics with source timestamps/limitations and show per-Project or per-destination insights.
- Let the agent propose new concepts or schedule changes based on evidence; do not silently modify permissions or publishing rules.
- Support A/B variations and cross-channel comparison while distinguishing correlation and causal claims.

### FR-24 — Monitoring, cost management and notifications

- Dashboard shows active/paused/stopped Projects, approval queue, next ideation/publishing occurrence, running jobs, blocked items and recent success/failure.
- Display provider estimates before costly generation, actual usage where available, budgets, reservations and alerts.
- Provide workflow trace identifiers, step histories, retries, error classification, safe manual retry and operator diagnostics.
- Preserve provider request IDs, output lineage, source references and publication IDs/URLs.
- Make user-facing status truthful when a provider request outcome is unknown or a cancellation cannot be guaranteed.
- Allow notification rules and quiet hours/time zones.

### FR-25 — OpenAI provider choice, managed allowance and bring your own key (v2.2)

- **Default mode — Studio-managed OpenAI:** every authenticated account can use a platform-managed OpenAI connection for supported AI features, subject to published plan limits, model availability, rate limits and fair-use controls. The platform may restrict expensive models. A real allowance number is a pricing decision; **500** in the prototype is illustrative, not a commitment.
- **Optional BYOK mode:** account owner can connect an OpenAI API project key, verify it, switch between managed and personal modes, replace the key, disconnect it, and view connection health/status. Existing secret values must never be revealed in the browser or export. A masked key suffix may be displayed.
- **Billing transparency:** in managed mode Studio covers its OpenAI request costs within the defined allowance; in BYOK mode OpenAI API usage is charged to the user's linked OpenAI API account under OpenAI's own terms. Studio can show its observed token use and approximate cost, **not** a complete or authoritative statement of the provider's bill. Studio subscription/product charges (if any) are separate.
- **Usage scope:** OpenAI key selection covers compatible OpenAI reasoning, chat, creative planning, scripts and storyboard generation. It does **not** automatically cover fal.ai, ElevenLabs, image models hosted elsewhere, Remotion infrastructure, publishing destinations, or research/data service costs.
- **Secure credential lifecycle:** connecting a key requires authenticated verification; credentials are encrypted at rest by backend-managed secret storage, protected during transit, never disclosed to the LLM prompt/n8n execution payload/UI after submission, and may be replaced/revoked. Disconnection blocks new BYOK usage without invalidating historical content or already-submitted requests.
- **Predictable errors:** invalid/revoked key, provider quota/429, lack of model access, or usage restriction surfaces a clear blocked/retryable state. **Never silently fall back** from BYOK to Studio-managed billing. Explicit user choice is needed to switch modes.
- **Quota governance:** Studio-managed usage uses per-account metering, concurrency/rate limits, preflight estimates or reservations for multi-step work, bounded retries, and transparent reset periods. BYOK still observes safety, abuse prevention, model capability, and app-level concurrency limits even if Studio does not pay the provider bill.
- **User-facing controls:** Settings → AI Providers shows mode selection, key status, Connect/Test, Replace, Disconnect, managed usage and relevant notes; Settings → Budgets & Usage shows cross-provider cost policy. Initial onboarding requires **no personal API key**.
- **Workflow consistency:** web, Telegram, scheduled ideation and every OpenAI-powered agent subworkflow resolve the same authorized preference at request time. Scheduled work must be blocked with visible status when its selected key becomes invalid. Request/provider usage is correlated to its Project, owner and run for audit.

**Acceptance:** a new user can use the managed mode without setup; a BYOK user can connect/test/switch/disconnect securely; one test for a failed user key proves there is no automatic charge against Studio's managed key; a disabled or exceeded managed allowance produces a bounded error without indefinite LLM retries.

## 8. Approval, automation and lifecycle policy

### 8.1 User-visible review actions

| Object | Primary actions | Consequence |
|---|---|---|
| Project | **Activate**, Pause, Resume, Stop, Edit | Controls authorized recurring automation, not creative/media approval |
| Concept | **Approve / Edit** | Approve a particular version for eligible production; Edit creates a working revision |
| Video output | **Approve / Regenerate** | Approve a particular produced file; Regenerate creates another attempt |
| Publishing | Schedule / Publish / Hold / Cancel | Authorizes one or more destination-specific deliveries |
| Connected account | Connect / Reconnect / Disconnect | Controls destination authorization, not creative ownership |

Unreviewed items remain in a reviewable state until an authorized user takes action.

### 8.2 When automation actually begins

- **Agent brainstorming / draft Project creation:** allowed before Project activation; only explicitly requested or consented research/provider work may run.
- **On first activation:** only after a nonempty initial launch selection is approved at the exact current versions and configuration is valid, selected recurring rules become eligible from their configured next occurrence. The activation action does not retrospectively approve other concepts, publish old videos or automatically render all historical concepts. Projects with zero recurring rules may still be activated after satisfying the initial-launch requirement.
- **Ideation:** n8n runs at Project-defined due times and saves new concepts for review unless an explicit auto-approval rule applies.
- **Production:** triggered by approved concept version plus enabled production behavior or a separately confirmed manual render request. Paid charges also require applicable budget authorization.
- **Publishing:** triggered only by a separately authorized job/slot with a ready approved output and connected destination. Approval does not itself publish.
- **Notifications/analytics:** may continue according to separately selected settings, but cannot override pause/stop or user permissions.

### 8.3 State transitions and outcomes

| Entity | Main states | Notes |
|---|---|---|
| Project | `draft → active ↔ paused → stopped → active`, `archived` | Stop disables automations; archive is not remote unpublish |
| Concept working version | `draft → pending_review → approved`, and newer revisions | Approval targets an immutable version; review can remain pending |
| Video job/attempt | `queued → preparing → rendering/generating → validating → ready_for_review → approved` | Also `blocked`, `failed`, `cancel_requested`, `cancelled`, `reconciling` where relevant |
| Publishing job | `draft_intent → blocked/scheduled → publishing → published` | Also `held`, `cancel_requested`, `cancelled`, `failed`, `reconciling` |
| Automation rule | `disabled ↔ enabled ↔ paused`, `stopped` | May be further gated by Project state |

### 8.4 Consequences of editing and revocation

| User action | Required system behavior |
|---|---|
| Edit approved concept | New working version under the same concept; old version stays immutable and linked outputs unchanged |
| Approve revised concept | New approved version and optionally new render; older output/schedule remains unless user explicitly changes it |
| Revoke concept approval | Block future new production for that version, attempt to hold/cancel pending work, preserve completed artifacts and history |
| Regenerate video | New render attempt, separately previewable and approvable; original file remains traceable |
| Revoke video approval | Hold/block future publishing of that output; external published copies remain until explicitly managed on the platform |
| Edit Publishing Pack | Draft metadata revision; already scheduled jobs keep their snapshot until explicit reschedule/update |
| Pause Project | Stop new automatic claims; hold future publishing; best-effort cancel active provider work, report outstanding state |
| Resume Project | Continue enabled rules, defaulting to skip missed occurrences and review stale publishing jobs before releasing |
| Stop Project | Disable automations until explicit reactivation, retain creative work and completed history |
| Download MP4 | Provide a copy; later approval withdrawal cannot recall it |
| Published to platform | Preserve platform ID/URL/history; separate authorized unpublish or metadata-edit action when supported |

### 8.5 Automation safety modes

Default mode is **human review** for concepts and videos. Optional **automatic concept approval** and **automatic video approval** can be enabled by an authorized user, separately, with precise Project scope, source restrictions, spending caps, quality checks and an audit record. Automatic publication additionally requires explicit destination/schedule authorization. Fully unattended publication is never inferred from a general instruction such as “make this campaign automatic.”

## 9. Application experience and navigation requirements

The required product experiences are **Overview, Agent, Projects, Content, Videos, Production, Publishing, Automation, Library, Settings and authentication**. This section records *behavioral requirements only*: component positioning, spacing, typography, palettes and visual treatment belong in a separate UX/design reference.

- **Overview is the post-login landing destination** for both new and returning users. New users can immediately describe an idea; returning users can also see Projects, review needs, automation outcomes, due items, costs and failures.
- **Agent-led creation:** a meaningful first message automatically starts plan preparation. Preparation offers durable, truthful progress and partial draft visibility. The output is a standard saved Draft Project, not a separate review-only object.
- **Unified Project Detail:** every Project status uses a single core view of Project Overview, Content, Creative Kit, Automation, Publishing, Assets and Activity. Draft Projects have full Agent access. Project status affects actions and automation eligibility, not structural access to editing.
- **Dedicated Content Detail:** each concept has one rich content view for overview, script/narration, scenes/storyboard, source and generated assets, Publishing Pack and immutable version history. Content is approved at a particular version; approval is distinct from inclusion in the initial launch.
- **Contextual activation:** when eligible, the normal Project view offers an activation confirmation. There is **no required Project review stepper, setup-reviewed marker, or `approve Project` operation**.
- **Production and Videos:** approved content can be used in a separately authorized provider-specific production request. Every output has distinct review/approval, history and optional download.
- **Publishing and Automation:** show actual destination/account authorization, current schedules, statuses, pending action, failures and recovery paths. Content/video approval does not silently grant publication.
- **Navigation and editing continuity:** application navigation and Agent collaboration are available throughout relevant work. Hiding an Agent conversation or changing Project/Content tabs must not lose messages, drafts or authoritative approval state. Responsive/accessibility requirements apply independently of the specific visual implementation.

There is no required Campaign entity, Ideas Inbox, Draft-only Project Review page or Project setup wizard. Proposed route names and visual composition are specified separately from this PRD.

## 10. Non-functional requirements and safeguards

| Category | Target/expectation |
|---|---|
| Security | Least privilege, protected API entrypoints, verified identity, RLS, encrypted secrets and secure provider callbacks |
| Privacy | User/tenant isolation, scoped Telegram linking, signed media access, configurable retention/export/deletion |
| Reliability | Durable events/jobs, idempotency, atomic transitions, bounded retries, ambiguous-outcome reconciliation |
| Responsiveness | Interactive requests return promptly or stream; video/long research tasks run asynchronously with durable progress |
| Observability | Correlation IDs across agent, API, n8n, renderer and publisher; actionable errors and audit history |
| Creative quality | Valid scene plans, visual reference fidelity, deliberate motion, readable text, captions and audio synchronization |
| Localization | Separate UI language, script language, voice language and platform requirements |
| Source integrity | Trace verified product facts/trend evidence; mark uncertainty and unsupported claims |
| Rights/compliance | Asset provenance, licensing flags, provider usage terms and platform policy checks |
| Cost control | Estimated vs actual provider cost, per-Project caps, bounded retries and explicit confirmation for overages |
| Accessibility | Keyboard navigation, adequate contrast, readable text, captions, status descriptions, reduced-motion UI where relevant |
| Maintainability | Stable domain contracts, versioned schemas, tested provider adapters, migration discipline |
| Resilience | Pause/stop/revocation checks immediately before external actions; truthful in-flight cancellation limits |

## 11. Implementation priorities and product phases

Phases are **a recommended sequence for building the complete product**, not a reason to omit requirements. Certain foundations are established early and progressively enhanced. Dependencies may justify delivering a capability from a later phase sooner.

| Phase | Outcome | Key capabilities |
|---|---|---|
| **Phase 1 — Application & Agent Foundation** | Users can converse, plan and review real Projects | Next.js app/API-first auth; Supabase/RLS; Project draft→active lifecycle; Brand Kit; shared n8n agent; dashboard chat; concept versions; visual planning; activation/approval policy; workflow visibility; secured API tools |
| **Phase 2 — Creative Production** | Users create and compare approved video outputs | Reference library; visual asset preparation; voice/captions; Remotion layouts; fal.ai provider selection; Hybrid adapter; cost estimates; durable jobs; **Approve/Edit** and **Approve/Regenerate**; downloads and comparison |
| **Phase 3 — Connected Automation & Distribution** | Projects run repeatable authorized workflows and publish | Recurring ideation; verified trend sources; independently scheduled publishing; account OAuth; YouTube and subsequent platform adapters; full Telegram agent continuity; notifications; pause/resume/stop; reliable retries and recovery |
| **Phase 4 — Advanced Creativity & Teams** | A scalable multichannel studio | Richer video models/templates; continuity and multi-scene storytelling; localization variants; series safeguards; platform analytics; experiments; teams and permissions; reusable brand libraries; advanced budgets/billing and operational scaling |

**Cross-cutting from the beginning:** permissions and approval boundaries, reliable background execution, provider capability checks, managed OpenAI/BYOK credential and quota governance, cost visibility, multi-interface identity, schema validation, access control and truthful job status. Full Telegram conversation is an explicit product requirement, even if individual transport features are delivered incrementally.

## 12. Acceptance criteria by end-to-end capability

1. After signing in, the user lands on Overview; sending an actionable creative idea immediately begins durable agent planning and produces an editable **draft Project** with coherent concepts and proposed settings, without a secondary Generate confirmation.
2. A user submitting one product image can produce a single-concept Project without creating separate campaigns or organizational containers.
3. An existing Project can receive new concepts or modified settings through the agent without creating another Project.
4. Draft, Active, Paused and Stopped Projects use the same core Project editing experience. A Project can be activated, paused, resumed, stopped and reactivated with predictable scheduling behavior; disabled rules never run automatically.
5. Project activation alone cannot render paid media or publish to external platforms without the relevant authorizations.
6. Each concept opens a dedicated Content Detail containing its full script/narration, storyboard, assets, Publishing Pack and version history. Concept review presents **Approve / Edit**; editing creates a new version and retains prior approved history.
7. Video review presents **Approve / Regenerate**; regeneration produces a separately traceable attempt.
8. An approved concept can produce a playable video via a chosen supported **Remotion, fal.ai or Hybrid** mode; capability errors are shown honestly.
9. Each render uses a validated Visual Production Plan with scene assets, motion, pacing, audio and reproducible settings.
10. Users can preview generation estimates and compare provider attempts without overwriting prior outputs.
11. Indonesian and English creative outputs align scripts, captions, on-screen text, voice and publishing metadata to effective language.
12. AI does not invent unsupported product claims or falsely label undated content as verified current trends.
13. n8n recurring ideation generates reviewable Project concepts at the configured timezone/cadence and avoids duplicate occurrence processing.
14. Automatic production happens only for eligible approved versions under enabled and authorized rules; manual render requests require an explicit authorized action.
15. Video approval and exact destination authorization are enforced before publication, including immediately before provider submission.
16. Social accounts can be connected at publishing time; missing authorization yields a truthful blocked status, while downloading remains available.
17. New concept versions do not mutate already scheduled or published outputs or publication metadata snapshots.
18. Revoking approval blocks new eligible work and exposes the exact status of in-flight or completed external operations.
19. Telegram messages from a securely linked account reach the same agent tools and can continue conversations and Projects begun on the dashboard.
20. Unlinked Telegram users cannot access or modify any Studio Project or media.
21. The interface displays workflow runs, failures, upcoming schedules, provider costs and links to resolved video outputs.
22. A user can download an approved video regardless of publishing integrations; the system does not claim that withdrawing approval recalls downloaded copies.
23. Team users (when enabled) can act only within their role and destination permissions, with auditable approvals.
24. Analytics (when enabled) indicate source, collection time and uncertainty and never silently rewrite creative or publishing policy.
25. First activation is blocked with a clear explanation if no initial-launch concept is selected or if any selected concept’s **current** working version is not approved; unselected concepts need not be approved.
26. Project activation is contextual to the unified Project view and requires no independent setup-reviewed state or multi-step wizard.
27. A Project created in an Agent chat can be reopened later in Draft status with full Agent access and the same Project view as an Active Project.
28. Planning stages and partial results reflect persisted workflow status; recovery after refresh or transport disconnect is possible without fabricating progress.
29. Creative Kit selections are AI-prepared, validated, overridable by the user and snapshotted per approved content version.
30. A conversation has at most one active linked Project context at a time; multiple conversations may link to one Project, and a mention of another Project does not silently change the link.
31. A Project with approved initial content may be activated with no recurring automations; subsequent content still follows concept/video approvals and separate cost/publishing authorization.

## 13. Success measures

- **Activation quality:** User-to-draft-Project and draft-Project-to-activation conversion; adoption of proposed settings.
- **Creative usefulness:** Percentage of proposed concepts developed/approved, edit depth and explicit creative-quality feedback.
- **Agent continuity:** Cross-surface conversation success and tool-action accuracy without duplicated/conflicting Project state.
- **Production quality:** Accepted render rate, regeneration count per approved video, audio/visual validation results and satisfaction by provider mode.
- **Automation quality:** Due-run success, duplicate prevention, time-to-result, pause/revocation enforcement and clear recovery from failures.
- **Publishing reliability:** Authorized on-time delivery, provider reconciliation, blocked reasons and accurate external post tracking.
- **Cost efficiency:** Estimated vs actual spend, cost per accepted output, unnecessary retries and reused assets.
- **Retention and collaboration:** Repeat Projects, active automation usage, edit/review completion and team turnaround where applicable.

Numerical service-level targets and business goals should be set from observed usage rather than invented in this document.

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Agent accidentally changes an existing Project | Explicit Project context, tool scopes, conflict/version checks, confirmation for high-impact changes |
| Overly general Remotion templates yield stiff results | Require storyboard/Visual Production Plan, diverse layouts, deliberate animated layers and quality checks |
| fal.ai video is costly, inconsistent or unavailable | Capability-aware model registry, preflight estimates, spend ceilings, independent attempts and fallback options |
| Auto-approval is mistaken for unrestricted publishing | Separate consent and gates for concept, video, budget and destination-specific publication |
| Pause or revoke races with n8n execution | Recheck state on atomic job claim and directly before external side effects; best-effort cancellations |
| Video edits silently change scheduled posts | Immutable version/output snapshots and explicit cancel/replace workflows |
| Product research invents claims or recommendations | Ground facts in supplied/evidence-backed sources; identify recommendations as suggestions |
| Trends are stale or unsupported | Store source timestamps and permit original-only strategy |
| Telegram sender impersonation or chat spoofing | Account-link challenge, sender verification, source-specific rate limits and tool authorization |
| Duplicate media charges or uploads | Idempotent internal jobs, provider request IDs, safe retries and outcome reconciliation |
| Social platform restrictions prevent distribution | Per-platform capability checks, block reason, download fallback and honest status |
| Media rights or likeness drift | Asset provenance, provider terms, human review and reference-fidelity checks |
| Team or tenant leaks | RLS, tenant isolation, delegated permissions, audit and access tests |

## 15. Open product decisions (not blockers to the architecture)

- Which video-generation models and price-quality policies are offered in each region and subscription tier?
- What is the default number of content concepts proposed per new Project, and when should the agent ask a follow-up?
- Which external social providers are integrated after YouTube, and what scopes and publishing modes do they allow?
- What detailed auto-approval restrictions and paid-generation consent policies are legally and operationally appropriate?
- What source providers are licensed for product research, images, trends and performance analytics?
- What advanced scene editing UI should complement AI chat and storyboard cards?
- What retention/deletion policies, plan limits, storage quotas and enterprise team roles will apply?
- How should assisted affiliate disclosures and platform-specific commercial content rules be presented?

## Appendix A — v2.0 foundation decision ledger

| Decision | Result |
|---|---|
| Retain the term **Project** | One creative and automation container regardless of whether its purpose is campaign, brand, series, channel or one post |
| No forced Project assignment or separate Ideas Inbox | Agent generates a draft Project from a new independent intention; adds content under an existing Project when asked |
| Agent available on web and Telegram | Shared conversations, tools, identity, Project context and authorization rules |
| **Activate Project** rather than Approve Project | Starts enabled automation without granting blanket production/publishing consent |
| Concept actions **Approve / Edit** | Simple review flow with versioned revisions |
| Video actions **Approve / Regenerate** | Simple review flow with immutable render attempts |
| Production methods **Remotion / fal.ai / Hybrid** | User-selectable, cost-aware providers under one job/output contract |
| API-first login and business authority | Next.js API authenticates and enforces domain rules; n8n orchestrates, does not own authorization |
| Two independent schedules | Recurring ideation and publishing cadence; production is an approval-driven event |
| Automation controllability | Pause, Resume, Stop; hold jobs safely; explicit reactivation and missed-run policy |
| Edits and revocations | Immutable approved snapshots; no silent modification of scheduled/published copies |
| Full-product PRD | No time-bound or assignment-driven narrowing; phases are implementation priorities |

---

## Appendix B — v2.1 finalized product decisions

| Decision | Contract |
|---|---|
| Overview is the entry point | Signed-in sessions default to Overview; no Project required to start |
| First actionable message starts agent planning | No second Generate confirmation; durable stages and resumability |
| One canonical Project Detail | Draft/Active/Paused/Stopped are states, not separate review interfaces |
| No required Project stepper | No setup-reviewed domain state, no separate `approve_project` action |
| Dedicated Content Detail | Full script/scenes/assets/Publishing Pack/versions per concept |
| Initial launch membership | Explicit selection distinct from content approval; selection can be revised before activation |
| First activation criteria | At least one selected initial concept, every selected latest working version approved, valid config and explicit enablement of selected automation |
| Creative Kit | AI-prepared typed defaults, explicit user overrides, versioned approved snapshots; historical `project_brand_kits` schema name can remain |
| One chat/project context | A conversation has zero or one active Project link; multiple conversations may link to a Project |
| Design independence | Visual appearance, pixels and layout belong in UX/design artifacts, not PRD/TDD |

**Decisions that remain open:** provider model availability and regional pricing, platform API capabilities, advanced consent policies, research licensing and billing remain implementation-time validations. They are not implicitly solved by the prototype.

---

**End of PRD v2.1**


## Appendix C — v2.2 decision register

| Decision | Product impact |
|---|---|
| Studio OpenAI is the default | New users can brainstorm and plan without bringing a key, within published quotas |
| Personal OpenAI API key is optional | Connect, test, replace, disconnect, switch billing source |
| No automatic billing fallback | Invalid or exhausted BYOK stops the affected OpenAI action until the user intervenes |
| User key does not pay for other providers | Video/voice/social adapters retain their own authorizations, quotas and costs |
| Calendar-first publishing with separate schedule composer | UX clarification only; scheduling/authorization domain behavior is unchanged |
| Management screen styling | Remains a UX specification concern, not a business requirement |
