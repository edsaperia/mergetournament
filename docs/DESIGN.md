# Design system

Current state: **no UI library** — Tailwind v4 utilities over a small set of
semantic design tokens. The look is a deliberate neutral placeholder awaiting
a real visual identity; the structure below is what makes replacing it cheap.

## Tokens

All tokens live in one place: the `@theme` block in
[`src/app/globals.css`](../src/app/globals.css). Every token is
`light-dark()`, so both modes are tuned in the same line. Components use
semantic utilities only (`bg-accent`, `text-soft`, `border-line`, …) — no raw
palette shades. **Rebranding starts and mostly ends in that file.**

| Token | Role |
| --- | --- |
| `background` / `foreground` | page surface and body text |
| `panel` | raised surfaces: banners, wells, table stripes |
| `wash` | barely-there hover wash |
| `soft` / `muted` / `faint` | secondary copy / metadata / placeholders |
| `edge` / `edge-faint` / `line` / `strong` | section borders / hairlines / control borders / hovered borders |
| `accent` / `accent-ink` / `accent-soft` | primary actions (currently near-black ⇄ white; make it cornflower blue here) |
| `live` / `live-ink` | "you are here", presence highlights |
| `ok` / `ok-surface` | success, readiness ticks, the canonical-text banner |
| `warn` / `warn-surface` | time pressure: backstop window, pause, proposed-freeze |
| `danger` / `danger-surface` | expiring countdowns, errors, unsaved-draft banner |
| `note` / `note-soft` / `note-surface` | line-comment threads and composer |

Per-tournament theme overrides ([`src/lib/theme.ts`](../src/lib/theme.ts))
cover every token; the ready-made presets deliberately leave status and
comment tokens stock so warnings read the same in every palette.

Typography: Geist Sans (body) and Geist Mono (documents, code, countdowns),
loaded in `src/app/layout.tsx`, exposed as `--font-sans` / `--font-mono`.
Spacing and radii are Tailwind defaults (`rounded-lg` cards/buttons,
`rounded-md` inputs); not yet tokenized.

## Shared controls

[`src/app/ui.tsx`](../src/app/ui.tsx): the `<Button>` component
(variant × size) plus `field`/`fieldLabel` class strings for form inputs.
[`src/app/modal.tsx`](../src/app/modal.tsx): the one `<Modal>` — Escape and
click-outside dismissal, focus handling, aria-modal — used by the flip
reveal, the roster draft viewer, and the pause overlay.

## Not yet tokenized (known debt)

- **Spacing/radius/type scale**: Tailwind defaults, un-aliased.
- **Form fields** are still class strings, not components.

## Component inventory

| Piece | File |
| --- | --- |
| Landing page | `src/app/page.tsx` |
| Tournament creation form | `src/app/new/new-tournament-form.tsx` |
| Tournament page (header, convening panel, exports) | `src/app/[slug]/page.tsx` |
| Bracket | `src/app/[slug]/bracket-view.tsx` |
| Merge workspace (3 panes) | `src/app/[slug]/merge/[id]/page.tsx` |
| Collaborative editor | `.../merge/[id]/collab-editor.tsx` (CodeMirror theme inside) |
| Lock-in / bearer controls | `.../merge/[id]/workspace-controls.tsx` |
| Backstop window controls | `.../merge/[id]/window-controls.tsx` |
| Coin-flip reveal | `src/app/[slug]/flip-reveal.tsx` |
| Chat panel | `src/app/[slug]/chat-panel.tsx` |
| Text + line comments | `src/app/[slug]/text/[id]/commentable-text.tsx` |
| Draft editor | `src/app/[slug]/submit/draft-editor.tsx` |
| Admin dashboard / roster / lifecycle buttons | `src/app/[slug]/admin/*` |
| Countdowns / SSE refresh | `src/app/live.tsx` |
| Action feedback | `src/app/action-status.tsx` |

## Spec-driven UI requirements to keep in mind (SPEC §8)

- **Observer view is projector-first**: large type, high contrast, passive.
  Currently it's just the normal bracket — a dedicated projector mode
  (bigger countdowns, no chrome) is future work.
- **Mobile one-handed**: a first mobile pass is in (16px inputs, wrapping
  tabs, truncating header); still owed a real-device shakedown.
