# AI Content Studio — UX Screen Specification v2.7

**Status:** reviewed interaction direction / simulated prototype, not final visual design.
**References:** PRD v2.2, TDD v2.2, n8n Workflow Specification v1.1.
**Prototype:** `AI-Content-Studio-UX-v2.7-Hybrid-Prototype.html`

## Design intent and version relationship

v2.7 deliberately combines the management-focused layouts from **v2.5** with the consistent domain pages from **v2.6**. The user prefers the v2.5 Publishing, Automation, Library and Settings (Manage) approach, but the **v2.6 Schedule Video composer**. This version is a layout/interaction consolidation, **not** a final design system.

## Screen decisions

| Screen | Direction kept | Behavior |
|---|---|---|
| Overview (home) | v2.6 approved opening | Prompt starts agent planning with first message |
| Project list/detail | v2.6 unified Project | Draft, Active, Paused, Stopped share the same Project tabs; no special review wizard |
| Content Library / Content Detail | v2.6 dedicated concept editor | Script, Storyboard, Assets, Publishing Pack, Versions, Approve / Edit |
| Production / Videos | v2.6 | Remotion, fal.ai, Hybrid and immutable output review |
| **Publishing** | **v2.5 calendar-first** with added monthly navigation | Month view by default, event markers, click date to inspect queue, upcoming status and channel connections |
| **Schedule a video** | **v2.6 composer** | Approved video, destination, date/time, post title and authorization preflight; separate page |
| **Automation Center** | **v2.5 management overview** | Rule/Project overview, status metrics, activity panel, execution history and manage actions |
| **Asset Library** | **v2.5 catalog feel** | Asset cards/thumbnail grid, type filters and provenance context |
| **Settings (Manage)** | **v2.5 management structure** | Account, Connections, Telegram, Budgets & Usage, Notifications; now includes AI Providers |
| **AI Providers** (new) | **v2.7** | Managed OpenAI default and optional BYOK: connect/test/replace/disconnect in real product; demo controls use **no real key** |

## AI Providers UX behavior

1. Default: **Studio AI** selected. Show allowed/included usage and reset policy once plan levels are set. Prototype displays 320/500 fictional units only.
2. Optional: **My OpenAI API key**. If there is no connected credential, show a clear blocked/not-connected state and a secure key entry + Verify action in the implemented app. The static prototype intentionally disables entering a real secret and only simulates connection.
3. Connected state: Show provider, verified status, masked suffix and last verified time (future backend). Offer **Replace** and **Disconnect**, never reveal the original secret.
4. Changing effective mode is an explicit user choice. If BYOK fails or is disconnected, do not silently charge the Studio-managed account. Present a diagnostic and ask the user to reconnect or explicitly switch.
5. The app must distinguish OpenAI account charges from fal.ai video generation, ElevenLabs TTS, infrastructure costs and platform distribution authorizations.
6. Model options must be capability/plan-filtered and verified by the API. No hard-coded price/credit allowances are product commitments.

## Navigation rules

- Global navigation is independently collapsible on standard screens and keeps the user preference while switching between them. On mobile it becomes a drawer.
- Project and Content Detail maintain a separately collapsible Agent panel. Opening the Agent can enter focus mode without changing the Project status.
- The Project context is at most one active Project per conversation; multiple conversations may belong to the same Project.
- Publishing Calendar and Schedule Composer are separate routes within one Publishing section. Successfully scheduling in the demo returns to the calendar and selects the scheduled date.
- All state-changing interactions are **mock only**. No API keys, OAuth tokens, subscriptions, content approvals, rendering, or publishing are created by this HTML prototype.

## Service contracts influenced by these screens

- `GET /api/settings/ai-provider`, provider mode and key lifecycle endpoints, and `GET /api/settings/ai-usage` in TDD v2.2 §23.
- `GET /api/publishing-jobs?start&end&status&destination`, returning exact authorized output+platform+timezone and blocked/held statuses.
- `GET /api/automation/summary` with read-only next-due data and execution status across owned Projects; Project rule updates still use existing domain APIs.
- `GET /api/assets?kind&projectId&cursor` for private, filtered metadata + signed previews, excluding unlicensed/unauthorized media.
- Management screens must show account-scoped aggregates with ownership filtering; the prototype's counts are fake.

## Screens and image references

`AI-Content-Studio-UX-v2.7-Screens/` contains numbered PNG snapshots: Overview, Publishing Calendar, Schedule Video, Automation Center, Asset Library, Settings, Managed AI, Connected BYOK, Unified Project, Content Detail, mobile Publishing, and mobile AI Providers.

## Unchanged product rules

First activation still requires at least one **selected and approved initial launch concept**. Project activation does not itself pay for renders, approve a video, or publish. A Project and a Content version have **different** states; concept approval is not a Project lifecycle state. All old outputs and publishing jobs retain immutable lineage when content changes.

## Remaining design questions

Visual identity (typography, density, color/illustration style), detailed calendar interaction patterns, final publishing metadata requirements per destination, exact AI credit policy, organization-level credential ownership, and usage graph design remain open. Their future refinement should not force a product-architecture rewrite.
