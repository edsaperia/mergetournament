# Deploying mergetournament.org

The app is deliberately a **single Node server** (SPEC §10): the scheduler
tick, the Hocuspocus sync server, the SSE event bus, and the web app all run
in one process, started by Next.js instrumentation. This rules out serverless
and multi-instance deployments — use one VPS or one Fly.io machine, plus a
managed Postgres.

## What runs where

| Piece | How it runs |
| --- | --- |
| Web app + SSE | `next start` (port 3000) |
| Scheduler (1s tick) | started by `src/instrumentation.ts` in-process |
| Collab sync (Yjs/Hocuspocus) | in-process WebSocket server on `COLLAB_PORT` (default 3001) |
| Database | Postgres via `DATABASE_URL` (PGlite fallback is dev-only) |
| Email | Resend when `RESEND_API_KEY` is set; console otherwise |

## Environment

| Variable | Required in prod | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `AUTH_SECRET` | yes | long random string; signs sessions, magic-link exchanges, collab tokens. Generate: `openssl rand -base64 48` |
| `BASE_URL` | yes | e.g. `https://mergetournament.org` — used in emailed links |
| `COLLAB_WS_URL` | yes | browser-visible WebSocket URL, e.g. `wss://mergetournament.org/collab` if reverse-proxied, or `wss://mergetournament.org:3001` |
| `COLLAB_PORT` | no | default 3001 |
| `RESEND_API_KEY` | recommended | without it, emails print to the server console |
| `EMAIL_FROM` | no | default `Merge Tournament <noreply@mergetournament.org>`; the domain must be verified in Resend |

## Steps (any host)

1. Provision Postgres; set `DATABASE_URL`.
2. Run migrations: `npx drizzle-kit migrate` (uses `drizzle.config.ts`; the
   SQL lives in `drizzle/`).
3. `npm ci && npm run build && npm start`.
4. Reverse-proxy (Caddy/nginx/Fly) `:3000` for HTTP **and** expose the collab
   WebSocket — either proxy a path (e.g. `/collab` → `localhost:3001`) or
   open the port directly; set `COLLAB_WS_URL` to match. The proxy must
   allow long-lived connections (SSE and WebSockets).
5. Set up Resend: verify the sending domain, create an API key.

## Fly.io sketch

- One app, one machine, `internal_port = 3000`, plus a second service for
  3001 (or an `http_service` handler for the WebSocket path).
- `fly postgres create` (or any managed Postgres) → set `DATABASE_URL`.
- Secrets: `fly secrets set AUTH_SECRET=… RESEND_API_KEY=… BASE_URL=… COLLAB_WS_URL=…`.
- Keep exactly **one** machine (`min_machines_running = 1`, no autoscale):
  the scheduler and sync server are in-process and single-instance.

## Operational notes

- The tick is idempotent and crash-safe: on restart, state re-derives and
  the tournament catches up to the clock. A restart mid-round loses nothing.
- Every random choice is seeded and audit-logged; `/[slug]/export/audit.jsonl`
  reproduces the tournament.
- Back up Postgres; the database is the only state (Yjs docs persist into it).
