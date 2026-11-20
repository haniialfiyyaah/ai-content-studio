# Design System — Calm Studio

Derived from the shipped Studio home and app shell (`src/app/globals.css`, `src/components/layout/app-shell.tsx`, `src/components/home/*`, `src/components/consent/*`). Direction contract: `.impeccable/surfaces/src-app-app-page-tsx.md` (v2). The earlier Two-Ink Press (risograph) direction is superseded.

## Product stance

The signed-in home is a conversation with one agent. The agent proposes; the creator decides. Approve concept, authorize spend, approve video and publish are four separate clicks. Counts, stages and costs come from persisted rows only — never invented.

## Palette

| Token | Hex | Role |
|---|---|---|
| `--stone` | `#f3f2ef` | Page ground, theme color |
| `--stone-deep` | `#e9e7e2` | Soft fills, project tone 3 |
| `--white` | `#ffffff` | Cards, panels, composer |
| `--ink` | `#26292b` | Body text |
| `--ink-muted` | `#5f6467` | Secondary text, placeholders |
| `--rule` | `#e2e0da` | Default borders |
| `--rule-strong` | `#c8c5be` | Stronger dividers, secondary button border |
| `--rule-input` | `#8f8b83` | Form-field borders (WCAG 1.4.11, ≥3:1 on white and stone) |
| `--sage` / `--sage-ink` / `--sage-dot` | `#e2ebe2` / `#46644d` / `#7f9e86` | Agent voice and working state |
| `--sand` / `--sand-ink` / `--sand-dot` | `#efe6d7` / `#6a5434` / `#c6975a` | Creator voice and "waiting on you" |
| `--teal` / `--teal-press` / `--teal-tint` | `#2f6f6a` / `#275d59` / `#dde9e6` | Primary actions and completed gates |
| `--clay` / `--clay-tint` | `#a8493c` / `#f5e2dd` | Blocked / failed only |

Legacy names (`--background`, `--accent`, `--danger`, …) remap onto this palette so secondary screens inherit it without a full restyle.

### Contrast (measured)

Text pairs meet WCAG AA: ink/stone 13.08, muted/stone 5.35, muted/white 5.99, sage-ink/sage 5.40, sand-ink/sand 5.79, white/teal 5.83, teal/teal-tint 4.68, clay/white 5.70, clay/clay-tint 4.56. Form borders use `--rule-input` (3.39 on white, 3.03 on stone). Sage-dot and sand-dot sit below 3:1 against white; they never carry meaning alone — every consent gate also shows detail text and an sr-only state.

## Typography

- **UI and display:** Archivo (`--font-body`). Display weight ~650, slight negative tracking (`-0.015em`).
- **Mono:** Spline Sans Mono (`--font-mono`) for times, costs, versions, stages.
- Body sits on stone with tabular nums. Selection uses teal-tint fill with ink text.

## Shape and motion

- Radii: `--radius` 12px (cards, panels), `--radius-sm` 8px (controls, tiles).
- Borders: 1px rules. No gradients. No decorative drop shadows.
- Ease: `--ease-out` `cubic-bezier(0.16, 1, 0.3, 1)`.
- Motion: one `calm-pulse` on working consent marks; disabled under `prefers-reduced-motion`.
- Focus: 2px teal outline, 2px offset (global `:focus-visible` and `.studio-focus-ring`).

## Layout

### Shell

- **Desktop:** 76px icon rail (`.app-rail`). Brand at top; Studio, Projects, Content, Videos, Publishing, Automation, Library as icon links with hover tooltips; Settings, sign out and avatar at the bottom. No desktop top bar.
- **Mobile:** `.app-mobilebar` + five-item `.app-tabbar` (Studio, Projects, Content, Publishing, More) + right drawer for the full nav.
- Home main content uses `.app-content.is-flush` (no padded page frame).

### Home (≥1100px)

`.home` is a two-column grid: thread (`1fr`) + aside (`20.5rem`, sticky). Below 1100px the aside stacks under the thread.

- **Thread:** heading "Studio", message log (`role="log"`, `aria-live`), decision card as the latest agent message, composer pinned at the bottom. Starter chips only when the thread is empty.
- **Bubbles:** `.bubble--agent` sage, `.bubble--user` sand.
- **Aside:** Today counts, last real run and orchestration note, Projects with toned initial tiles.

### Consent track

Four gates: Concept → Spend → Video → Publish. States: `done` (teal disc + check), `current` (sand ring + soft halo), `working` (sage + pulse), `blocked` (clay), `todo`. Compact on the home card; `.consent--wide` on Content Detail. Connector drawn from mark centres; mark, then label, then detail.

### Projects

Shared `projectTone(id)` (0–3) and `.project-tile[data-tone]`. Library cards use `.project-tile--cover` inside `.project-card`.

## Components

| Class / component | Use |
|---|---|
| `.primary-button` / `.secondary-button` (+ `--sm`) | Creator actions; primary is teal |
| `AuthorizeSpendButton` | Two-step confirm → `POST /api/projects/{id}/grants` |
| `.studio-panel` | White card with rule border |
| `.studio-input` | Fields; border `--rule-input` |
| `.pill` / `.pill--*` | Status tones (done / current / working / blocked) |
| `Button` (ui) | Tailwind remaps to accent / surface tokens |

## Do

- Keep teal for primary actions and completed gates only.
- Keep clay for blocked or failed only.
- Offer buttons; never auto-approve, auto-spend or auto-publish.
- Show real `workflow_runs.stage` / status strings; do not invent a progress ladder.
- Label fixture media as fixture.

## Don't

- Reintroduce lavender, neon pink, or riso misregistration offsets.
- Use gradients or decorative shadows on Studio chrome.
- Rely on colour alone for consent state.
- Apply this palette to the Remotion composition or the video player chrome — those stay intentionally dark (`src/remotion/short-form-video.tsx`).

## Open follow-ups

- Capture desktop and mobile screenshots into `.impeccable/review/` and run the finish review.
- ~~Align or retire `/agent`~~ — done (2026-11-20): `/agent` now redirects to `/`; `agent-chat.tsx` removed. Home is the only conversation surface.
- Content Detail and remaining secondary screens inherit tokens correctly (verified against `.app-page`/`.studio-panel` definitions in `globals.css`) but still use earlier, plainer layouts than the Studio home.
