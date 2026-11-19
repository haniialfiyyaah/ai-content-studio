---
version: 2
slug: "src-app-app-page-tsx"
primary_target: "src/app/(app)/page.tsx"
related_targets: ["src/components/layout/app-shell.tsx","src/components/home/studio-thread.tsx","src/components/home/decision-card.tsx","src/components/home/today-panel.tsx","src/components/consent/consent-track.tsx","src/app/globals.css"]
---

# Studio home (conversation-first) and app shell

Scope: the signed-in app shell (desktop icon rail, mobile bar, tab bar, drawer) and the home route, which is now the Studio conversation. Mode: Operate. Content Detail, Projects and the remaining screens inherit the palette and components; they keep their own layouts.

Audience and job: a solo creator opening the Studio between other work. They tell the agent what to make in one sentence, see inline what needs their call, and act without leaving the thread.

Constraints: real data only (projects, concepts, concept_versions, video_jobs, video_attempts, workflow_runs, publishing_jobs, agent_conversations, agent_messages). No invented counts or stages. Fixture media is labelled. Approve concept, authorize spend, approve video and publish stay four separate creator clicks; the agent only offers the buttons.

## Direction contract

THESIS: The Studio is a calm conversation with one agent. The agent speaks in sage, the creator in sand, and anything that is the creator's call is a single muted-teal action inside the thread. It refuses the category default of a greeting hero over stat cards and the previous board/queue layouts; the home screen is the conversation itself.

OWN-WORLD: Pale stone ground (#f3f2ef), white cards, soft ink text (#26292b) with a muted ink (#5f6467). Sage (#e2ebe2 / ink #46644d) for agent bubbles and agent-working states, sand (#efe6d7 / ink #6a5434) for creator bubbles and "waiting on you", muted teal (#2f6f6a) only for primary actions and completed gates, clay (#a8493c) only for blocked or failed. Archivo for display and UI, Spline Sans Mono for times, costs and versions. 12px / 8px radii, 1px rules, no gradients, no decorative shadows, one gentle pulse for "agent working" that stops under reduced motion.

STORY: The creator types an intention, the agent replies in the thread and drafts a Project; a decision card appears in the same thread listing what is waiting on them with each item's consent track; they authorize spend or open a review in one click; the right column quietly confirms today's counts and recent Projects.

FIRST VIEWPORT (desktop >= 1100px): 76px icon rail left (brand, Studio, Projects, Content, Videos, Publishing, Automation, Library; Settings, sign out and avatar at the bottom, labels as hover tooltips). Main column: "Studio" heading and one-line promise, the message log (agent sage bubbles left, creator sand bubbles right), the "These need your call" decision card as the latest agent message, and the composer pinned at the bottom with starter chips only when the thread is empty. Right column (20.5rem, sticky): Today counts (Waiting on you, With the agent, Scheduled), the last real run and whether planning runs on n8n or in-app, then Projects with toned initial tiles. Below 1100px the column drops under the thread; on mobile the rail becomes a top bar, a five-item tab bar and a right drawer.

FORM: Calm Studio, layout C (conversation-first) chosen by the creator over A (board) and B (inbox), palette "stone". Signature move: the consent track rendered inside the conversation, four gates (Concept, Spend, Video, Publish) with done as a teal disc and check, current as a sand ring with a soft halo, working as a pulsing sage mark, blocked as clay, each with its real detail text.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, its verdict, and DESIGN.md derived from the shipped code.

Critique reference comps (code-led, not approval-gated, local only): `.impeccable/mocks/calm/calm-c-conversation.jpg` (chosen), with `calm-a-board.jpg` and `calm-b-inbox.jpg` as the rejected alternatives. The earlier Two-Ink Press comps in `.impeccable/mocks/decision/` are superseded.
