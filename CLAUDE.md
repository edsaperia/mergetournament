@AGENTS.md

## Glossary

Stable names for parts of the product, so instructions can refer to them precisely.

- **round-countdown** — the clock in the merge workspace header; its expiry is the writing deadline.
- **decision-window** — the 60 seconds after the round-countdown expires (round state `closing`): text frozen, unfinished pairs still decide. Replaced the old "backstop / are-you-still-here window".
- **decision-modal** — the non-dismissible modal each bearer of an unfinished merge sees during the decision-window: countdown, frozen text, bearer buttons named for the two bearers, Accept the Merge / Reject the Merge (`src/app/[slug]/merge/[id]/decision-modal.tsx`). Header (countdown) and footer (one-line rules, all buttons) are fixed; only the middle scrolls. A vote button is highlighted only once pressed.
- **confirmation-strip** — the decision-modal's view of the frozen text: word and line count, first and last three lines with their real line numbers, "show all" to expand. It confirms *which* text, it isn't for rereading.
- **accept-vote** — one bearer's Accept in the decision-window; two lock the merge. A lock-in proposed before expiry counts as one. A sole active bearer's accept-vote advances the working text; otherwise their own input advances.

## Deferred work and questions for Ed

- **Deferred work is tracked as GitHub issues** on this repo, where a builder can be started on it with `@claude`. Each issue says what is deferred, why, and has a **Condition to act** section: checkable without judgement (a date, a file existing, a state a command can test, a decision Ed has taken). At the end of a task, re-read the open issues: condition met and trivial → do it; met and not trivial → offer it; not met → leave it out.
- **Questions only Ed can answer** go on his questions page (dev-ops `claude/QUESTIONS-PAGE.md`) with `project: "mergetournament"` and document id `mergetournament-<issue or PR number>` (or a slug), when he isn't at the keyboard. In a live session with him, ask directly.

## Builders and deploys

- This repo is wired for the shared Claude builder in `edsaperia/dev-ops` (`.github/workflows/claude.yml`): `@claude` in an issue or PR comment starts one on GitHub Actions. Follow dev-ops `CONVENTIONS.md` (draft PR as the conversation, `COORDINATOR:` / `QUESTION:` / `REPORT:` / `FINAL:` prefixes; Ed merges).
- **Merging to `main` does not deploy.** Production (mergetournament.org, a DigitalOcean droplet) is updated only by running `bash /opt/mergetournament/deploy/update.sh` on the server (`docs/DEPLOY.md`); that is Ed's call.
- Builders on Actions have no browser: UI changes need a human or local-session click-through before deploy.
