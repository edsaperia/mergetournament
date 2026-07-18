# mergetournament.org — Specification

## 1. Purpose

A web application that takes a set of submitted draft documents and reduces them to a single canonical text through a knockout tournament of pairwise merges, run against an automated schedule. Built for constitutional conventions — typically in person with ~20 drafts, but it must accept any number of drafts from 2 upwards.

Once the first round begins, the system runs itself — rounds open and close on schedule (or early, if every merge in a round has locked in), unresolved merges are settled by animated coin flip, and the process counts down to a single final text. The admin's live controls are exactly two: **begin** (ending the convening period) and **pause**. Everything else is automatic.

The full bracket — every pairing, every bye, every round's start time — is visible to everyone from the moment the tournament is published, and is designed to be projected on a wall throughout the event.

The app must be fully usable on desktop and on mobile web: participants will typically be on laptops and phones in the same room.

## 2. Roles

- **Participant**: submits one draft before the deadline; during the tournament is either a **bearer** (currently responsible for a text in the bracket) or on the **floor** (reading, chatting, commenting).
- **Administrator**: creates the tournament, manages the participant list, reviews submissions, publishes the bracket, begins the first round, and may pause. The Admin also has full **read access to everything participants can see** — bracket, all documents, all merge workspaces, all chats and comments — so they can verify the tournament is proceeding, but no write access to any text or chat room they are not otherwise a member of.
- **Observer** (read-only).

## 3. Authentication

Magic-link auth; no passwords, no signup:

- Admin seeds participants (name + email). Each receives a unique signed URL; visiting it sets a session cookie. Admin can re-issue links.
- The admin may **invite and remove participants freely at any time until the tournament is published**; after publication the roster is frozen.
- All chat and comments are attributed by name — nothing is anonymous.
- Observer view is mergetournament.org/\<slug\>, read only.

## 4. Lifecycle

### Phase 0 — Setup (admin)

Create a tournament with:

- **name** and **URL slug** (the tournament lives at mergetournament.org/\<slug\>; the instance supports multiple tournaments distinguished by slug);
- **round duration** and **break duration**, each configurable per tournament. Editable until bracket is published.
- **submission close datetime**; optional — if not set, admin closes manually.
- **tournament start datetime**; optional — if not set, admin starts manually.
- **participant list** (name, email); admin can add and remove people at will until the tournament starts.
- **default submission**. Template that all submissions initialise as.

### Phase 1 — Submission

- System emails each participant their magic link when they are added to the tournament.
- Each participant edits **one document** that is their submission: a simple wysiwyg markdown editor with a **live word count**, that initialises as the **default submission**.
- Participants may revise freely until submissions close.
- Drafts are private from other participants until the bracket is published, but **visible to the admin throughout**, who may review them for formatting and eligibility.
- Admin dashboard: mergetournament.org/\<slug\>/admin: submission status per participant, invite/remove controls (bulk add is possible), close-submissions button. The expected length of the tournament and the number of rounds (given number of participants and the length of rounds and breaks).

### Phase 2 — Publication and Convening

Triggered when the admin presses **Publish Bracket**:

1. **Bracket construction.** Let *n* = number of submitted drafts (n ≥ 2). The system builds a knockout tree by repeated halving: each round pairs the surviving texts two by two; if the count is odd, exactly one text receives a **bye** and stands over to the next round. (E.g. n=20 → surviving counts 20, 10, 5, 3, 2, 1: rounds of 10 merges; 5 merges; 2 merges + 1 bye; 1 merge + 1 bye; the final merge — five rounds.) Byes attach to **bracket slots**, decided at construction, so the tree shape is fixed upfront (except in the case of walkovers).
2. **Random seeding.** Drafts are assigned to slots uniformly at random by the system (seed recorded in the audit log).
3. **Schedule generation.** Round times are computed from the configured durations and displayed on the bracket, counting from Begin (see below). The **global countdown** — total remaining time until the final merge locks, assuming every remaining round and break runs its full duration — is displayed prominently on the bracket view.
4. **Notification.** Every participant is **emailed**: the tournament has begun, here is your link.
5. **Convening.** The tournament now sits in a special untimed break — the **Convening** — before the first round. All drafts become readable by everyone; all draft chats and round-1 merge chats are open; the bracket and schedule are on the wall. Participants log in, find their first partner, sit next to them, and get oriented. The Convening ends either by all participants clicking a button to manually confirm that they are ready, or by the admin clicking a button to manually start the tournament: *"Has everyone managed to log in? Does everyone understand what's going on? Is everyone sitting next to their first partner? Okay — **Begin**!"* The first round's countdown starts on that press, and the schedule anchors to it.

### Phase 3 — Tournament (automated from Begin)

**Round open.** At each round's start, its merges open simultaneously; bearers' screens switch to the merge workspace.

**The merge workspace** (per pair) — three tabs:

- **Input A** and **Input B**: the two input texts, read-only, live word count, **line numbers**, and a **"copy all"** button. Each input tab carries **that text's own chat** (a draft's chat, or — for later rounds — the chat of the merge that produced it, so discussion travels with the text through the bracket) and supports **inline comments** (see §5).
- **Merge candidate**: the shared working editor — real-time collaborative markdown via Yjs (character-level CRDT, presence cursors), live word count, line numbers, copy-all. This tab carries **the current merge's chat**. The merge candidate takes **no inline comments**: the pen is the pair's alone; lobbying arrives through chat. The editor starts blank.
- The **round countdown** is always visible in the workspace — the workspace shows *this round's* clock, not the global one (the global countdown lives on the bracket view).

**Bearer selection.** At any time during the round, the bearers can each select which one of them they prefer to be bearer for the next round. Selection is confirmed after the text is confirmed; if they both pick the same name or one has not given a preference, the preferred bearer is confirmed; if they don't pick the same name or neither has given a preference, the system chooses uniformly at random between them with the coin-flip animation.

**Lock-in.** Locking in the text requires two-key consent. At any time during the round, either bearer may press **Propose Lock in** to freeze the text. The other bearer may then press **Confirm Lock in** to finalise it, or **Keep Editing** to unfreeze it and unlock the other. If either bearer has not selected their preferred bearer for the next round when the text is confirmed, they are prompted to do so.

**The coin flip.** Every system-made binary choice (advancing bearer; backstop resolution) is presented as an animated "coin flip" (the view flashes between the two choices, faster and faster, until the winner is shown after about six seconds). Results and seeds are logged, and posted to bracket view and the relevant chats.

**Round close.** A round closes when its clock expires, or early if every merge in the round has both locked in and selected its bearer. On early close, the break begins immediately, all subsequent scheduled times shift forward, and the global countdown drops accordingly (displayed times update live; the schedule is a ceiling, not a promise).

**The backstop.** At clock expiry, editing freezes, and for every merge **not locked in**, bearers who have been idle (not edited the merge, selected a bearer, or pressed lock in during that round) see a prominent "Are you still here? YES!" control for 60 seconds to confirm that they're still active. At the window's end:

- Merges that are locked with bearer selected are fully resolved.
- Any merge with its **text locked but bearer selection incomplete**: the system coin-flips (with animation) between the two bearers to choose which will advance.
- Any merge **not locked in and both bearers active**: the system coin-flips (with animation) between the two input texts; the winning input advances intact, borne by its incoming bearer. The unfinished working text is archived out of the bracket.
- Not locked, **one** bearer active: the active bearer advances with the merge text, or with their input if the merge text is blank.
- Not locked, **neither** bearer active: the merge is archived entirely and nothing advances — the slot is empty.

**Byes and Walkovers.** A merge with exactly one input (its other feeder slot empty) is a walkover; a merge with no inputs propagates emptiness. A text is idle in a round if it holds a bye slot or arrives by walkover. At the end of a round, if two or more texts are idle in the next round, the system pairs them into ad-hoc merges (posted to chat and the bracket); any odd remainder stands over as usual. An ad-hoc merge behaves identically to a scheduled one — workspace, chat, lock-in, backstop. Its result takes the bracket position of one of its two inputs, chosen randomly; the vacated position propagates as empty downstream. A single idle text simply stands over as a bye: shown as such in the bracket, readable and chattable during the round it sits out. If the final has no inputs, the tournament concludes with no canonical text.

**Breaks.** The break timer starts automatically at round close. All surviving texts are readable with chats and comments live; upcoming merge chats open as their participants resolve, so lobbying on the next pairing can begin during the break. At expiry, the next round opens automatically.

**The finish.** When the final merge locks (or is backstopped), the tournament completes: the bracket view remains — now complete, with the canonical text at its root — and every node stays clickable through to its full-screen text. The completed, explorable bracket is the tournament's terminal state and permanent home page. Every participant is **emailed** with a link to the tournament and also the full canonical text.

### Pausing

From Begin onward, the admin may **pause** the global clock (fire alarm, power cut, lunch overrun). Pause freezes every timer *and all participant activity*: merge editors become read-only, lock-in, chat, and comment input are disabled, and every participant and observer screen blurs behind a modal — **"Tournament paused by the admin"** — with the frozen countdown shown. Unpause dismisses the modal everywhere and resumes exactly where things stood. Pauses are logged and posted to the global chat. There is deliberately no other live control: no adding time to one round, no reassigning bearers, no overriding flips.

## 5. Chat and comments

Two mechanisms, deliberately distinct: **chat directs attention; inline comments provide detail in context.**

**Chat.** A sidebar present throughout the app. It is collapsible: any user can **hide and unhide** chats at will. Rooms:

- **one global chat** for the whole tournament;
- **one chat per original draft**, open from publication;
- **one chat per merge**, opening the moment that merge's candidates and bearers are fixed (round-1 merges at publication; later merges as soon as both feeder slots resolve). A merge's chat travels with its result text: when that text appears as an input in a later round, its tab shows this chat.

All chat is named and open to all authenticated users. **System events post into chat** as they happen: round openings/closings and pauses in the global chat; lock-ins, bearer selections, and flip outcomes in the merge's chat (flips echoed to global); bye stand-overs in the relevant chats. The chat is the tournament's running narrative log.

**Chats are perpetual.** No room ever closes — not at round end, not at tournament end. The archived tournament remains a living annotation surface for future readers, including future cohorts.

**Inline comments.** Any authenticated user may attach a named comment to a text range of any **read-only document text** — original drafts, round inputs, merge results, byes, the final text. Comments render in context (anchored to line/range, collapsible like the chats). The **working merge candidate takes no comments**. Comments, like chats, stay open perpetually.

## 6. Data model (indicative)

```
Tournament(id, slug UNIQUE, name, phase, round_duration_s, break_duration_s,
           submission_deadline, begun_at?, seed, paused_at?, total_paused_s)

Participant(id, tournament_id, name, email, token_hash, role)

TextVersion(id, tournament_id, kind: DRAFT|MERGE_RESULT|WORKING_ARCHIVED,
            body_md, word_count, parent_a_id?, parent_b_id?,
            author_id?, created_at)            -- immutable; parents ⇒ provenance tree

Slot(id, tournament_id, round_no, position, kind: MERGE|BYE)

Merge(id, slot_id, text_a_id, text_b_id, bearer_a_id, bearer_b_id,
      ydoc_ref, state: PENDING|OPEN|LOCKED|RESOLVED,
      locked_at?, result_text_id?, advancing_bearer_id?,
      resolution: AGREED|BEARER_FLIP|BACKSTOP_FLIP, flip_seed?)

Round(id, tournament_id, number, scheduled_start, actual_start?, actual_close?, state)

ChatRoom(id, tournament_id, kind: GLOBAL|DRAFT|MERGE, subject_id?)   -- perpetual

Message(id, room_id, author_id?, kind: USER|SYSTEM, body, created_at)

Comment(id, tournament_id, author_id, text_version_id,
        range_start, range_end, body, created_at)                    -- perpetual

AuditLog(id, tournament_id, action, payload_json, created_at)  -- append-only:
        roster changes, seeding, begin, round transitions (incl. early closes),
        lock-ins, flips (with seeds), pauses, emails sent
```

All texts are immutable versions; every merge result records its two parents, so the complete provenance tree — final text back to original drafts — falls out of the schema.

## 7. Timing engine

- **Server-authoritative.** All clocks derive from begun_at + offsets + total_paused_s, adjusted for early round closes (each round records actual_start/actual_close); clients render countdowns from server timestamps and never decide anything.
- The scheduler fires transitions at min(round clock expiry, all-merges-locked); transitions are idempotent and crash-safe (state re-derives from the schedule and the merge states on restart).
- The global countdown recomputes on every early close: remaining full durations of untouched rounds and breaks, minus elapsed time of the current segment.
- Live updates via SSE (bracket state, timers, flips, chat, comments). The merge editors use Yjs over Hocuspocus, with **server-enforced write gates**: the sync server authenticates every connection with a role-scoped token (bearers of the open merge: read-write; everyone else, including the admin and observers: read-only) and **rejects all document updates** for any merge that is LOCKED or any tournament that is PAUSED — including buffered updates arriving late from lagging or tampered clients, whose local divergence is discarded. Client-side read-only states are UX; the server gate is the guarantee. Server-authoritative applies to content exactly as it does to clocks.

## 8. Views

All views responsive: full-featured on desktop, usable one-handed on mobile web (tabs, collapsible chat, big countdowns).

1. **Observer view**: the full bracket tree, round times, global countdown, live merge states, any coin flip in progress. Every node clickable to its full-screen text; otherwise passive. Large type, high contrast, for viewing on a projector. After the finish, this persists as the completed, explorable bracket.
2. **Participant view**: the clickable bracket with *you are here* and the global countdown; the chat sidebar; inline comments on readable texts; switching to the three-tab merge workspace (with the round countdown) when the participant is a bearer in an open round.
3. **Admin view**: setup, slug, roster management, submission review dashboard, Publish Bracket, Begin, and Pause — plus full read access to everything in views 1–2, for verifying that things are proceeding. Can post in the global chat.

## 9. Exports

1. **The canonical text** (export as markdown).
2. **The provenance tree** — every version with parentage, plus a rendered diagram (Mermaid source) tracing the final text back to every original draft.
3. All original drafts (markdown bundle, attributed).
4. The audit log (JSONL), including all seeds — the tournament is fully reproducible.

## 10. Principles & non-goals

- **The clock governs; humans negotiate.** Content authority sits with the pairs; time authority sits with the schedule; the admin's discretion is Begin and Pause.
- **Randomness is performed, not hidden.** Every system choice is a six-second public coin flip, logged with its seed.
- **Small and re-runnable.** ~20 users, one server; multiple tournaments distinguished by slug. No accounts system beyond magic links.

## 11. Suggested stack

- Next.js (App Router) + TypeScript, Drizzle ORM, Postgres, Tailwind.
- Yjs for the merge editor via **Hocuspocus** specifically (its authentication and update-rejection hooks are load-bearing — plain y-websocket cannot enforce locks, pause, or read-only roles); Tiptap bindings, markdown serialisation.
- SSE for bracket/clock/flip/chat/comment events.
- Resend for magic links, reminders, start and conclusion notifications. All emails plain-text-friendly.
- Deploy: single small VPS or Fly.io + managed Postgres.
- Tests, in priority order: bracket construction for all n ≥ 2 (property test: every text has exactly one fate; bye counts correct; provenance forms a tree); schedule arithmetic including pauses *and early closes*; round-close backstop idempotency; lock-in/un-press state machine; idle-matching (property test: no round contains two idle texts; ad-hoc merges conserve the n − 1 − abandonments invariant; emptiness always resolves by the final).
