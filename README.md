# Merge Tournament

**A fair method for combining many draft documents into one by knockout tournament of pairwise negotiations.**

A merge tournament takes a set of draft documents — position papers, proposed constitutions, competing specifications — and produces a single canonical text. Drafts are seeded into a knockout bracket at random. In each round, pairs of texts meet: their two bearers negotiate a merged text in a shared editor, against a fixed deadline. Both must consent to the result. If the clock expires first, a coin flip selects one of the two input texts to advance intact. Rounds halve the field until one text remains — with full provenance back to every original draft.

Built for constitutional conventions — but the structure is general: standards bodies reconciling competing proposals, activist groups synthesising position papers, communities drafting charters or codes of conduct.

The full specification lives in [`docs/SPEC.md`](docs/SPEC.md); the theory and pitch in [`docs/COPY.md`](docs/COPY.md); deployment in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## What works

- **Submission**: magic-link auth (no accounts), one draft per participant with live word count, admin dashboard with roster management and expected-length readout.
- **Publication**: bracket construction for any n ≥ 2 with byes, uniformly random seeding (seed recorded), schedule generation, invitation emails.
- **The tournament runs itself**: rounds open and close on the clock (or early on unanimous lock-in); a 60-second are-you-still-here window at expiry; backstop coin flips; byes, walkovers, and ad-hoc idle-matching; pause/resume as the admin's only live controls besides Begin.
- **Real-time negotiation**: Yjs over Hocuspocus with server-enforced write gates — bearers hold the pen, everyone else watches live; late updates against a frozen merge are rejected server-side.
- **Chat and comments**: a global room, a room per draft and per merge (discussion travels with texts through the bracket), system events narrating the tournament, line-anchored inline comments on every read-only text.
- **Live everywhere**: SSE pushes bracket, clock, chat, and flip changes to every screen; coin flips play as a six-second performed reveal.
- **Exports**: canonical text, provenance tree (Mermaid), attributed drafts bundle, and the full audit log as JSONL — the tournament is reproducible from its seeds.

## Development

Zero setup — no local Postgres or email service needed:

```bash
npm install
npx tsx scripts/seed-dev.ts    # demo tournament in submission phase, prints magic links
npm run dev                    # http://localhost:3000  (emails print to this console)
```

Or `npx tsx scripts/seed-live.ts` to boot straight into a running tournament
with short rounds. Without `DATABASE_URL`, an embedded Postgres (PGlite)
persists under `.data/`; the seed scripts must run while the dev server is
stopped (single-process database).

```bash
npm test                       # 81 tests: property-based bracket/schedule/engine,
                               # PGlite-backed services, real-WebSocket collab gates
```

## Stack

Next.js (App Router) + TypeScript · Drizzle ORM + Postgres · Yjs via Hocuspocus (CodeMirror 6 client) · SSE · Resend · Tailwind. One server runs everything; see [`docs/DEPLOY.md`](docs/DEPLOY.md).

## License

[AGPL-3.0](LICENSE).
