# Merge Tournament

**A fair method for combining many draft documents into one by knockout tournament of pairwise negotiations.**

A merge tournament takes a set of draft documents — position papers, proposed constitutions, competing specifications — and produces a single canonical text. Drafts are seeded into a knockout bracket at random. In each round, pairs of texts meet: their two bearers negotiate a merged text in a shared editor, against a fixed deadline. Both must consent to the result. If the clock expires first, a coin flip selects one of the two input texts to advance intact. Rounds halve the field until one text remains.

This repository contains the software that runs the event: submission, seeding, scheduling, the collaborative merge workspaces, the coin flips, and the archive. Open source and self-hostable, with magic-link authentication and no accounts.

Built for constitutional conventions — but the structure is general: standards bodies reconciling competing proposals, activist groups synthesising position papers, communities drafting charters or codes of conduct.

## Status

Early development. The full specification lives in [`docs/SPEC.md`](docs/SPEC.md); the theory and pitch in [`docs/COPY.md`](docs/COPY.md).

## Stack

- Next.js (App Router) + TypeScript, Tailwind
- Drizzle ORM + Postgres
- Yjs via Hocuspocus for the collaborative merge editor (Tiptap bindings)
- SSE for bracket/clock/flip/chat/comment events
- Resend for magic links and notifications

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## License

To be decided.
