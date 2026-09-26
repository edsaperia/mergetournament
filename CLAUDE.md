@AGENTS.md

## Glossary

Stable names for parts of the product, so instructions can refer to them precisely.

- **round-countdown** — the clock in the merge workspace header; its expiry is the writing deadline.
- **decision-window** — the 60 seconds after the round-countdown expires (round state `closing`): text frozen, unfinished pairs still decide. Replaced the old "backstop / are-you-still-here window".
- **decision-modal** — the non-dismissible modal each bearer of an unfinished merge sees during the decision-window: countdown, frozen text, bearer buttons named for the two bearers, Accept the Merge / Reject the Merge (`src/app/[slug]/merge/[id]/decision-modal.tsx`). Header (countdown) and footer (all buttons) are fixed; only the middle scrolls.
- **confirmation-strip** — the decision-modal's view of the frozen text: word and line count, first and last three lines with their real line numbers, "show all" to expand. It confirms *which* text, it isn't for rereading.
- **accept-vote** — one bearer's Accept in the decision-window; two lock the merge. A lock-in proposed before expiry counts as one. A sole active bearer's accept-vote advances the working text; otherwise their own input advances.

Deferred work lives in `docs/outstanding-issues.md`.
