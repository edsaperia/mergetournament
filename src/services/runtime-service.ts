/**
 * Tournament runtime (SPEC §4 Phases 2-3, §7): publish, begin, pause, and
 * the idempotent tick that opens/closes rounds, backstops unresolved merges,
 * populates the next round (byes, walkovers, ad-hoc idle-matching), and
 * completes the tournament.
 *
 * All wall-clock instants come in as `now` parameters (testability); all
 * schedule arithmetic happens in effective seconds since Begin. Every random
 * choice draws from a recorded seed.
 *
 * Deferred to later milestones: the 60s are-you-still-here window (backstop
 * currently treats sole-active bearers as making no choice, so their own
 * input advances), Yjs editing, SSE push, flip animation.
 */

import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  auditLog,
  chatRooms,
  merges,
  messages,
  participants,
  rounds,
  slots,
  textVersions,
  tournaments,
  type Merge,
  type Tournament,
} from "../db/schema";
import { buildBracket, seedBracket, type Bracket } from "../lib/bracket";
import {
  applyAction,
  planRound,
  resolveMerge,
  type MergeAction,
  type MergeInput,
  type MergeSession,
  type ResolvedMerge,
  type Side,
  type TextEntry,
} from "../lib/engine";
import { commitmentOf, deriveSeed, makeMasterSecret } from "../lib/commit";
import { mulberry32 } from "../lib/rng";
import { effectiveNow, scheduledStarts } from "../lib/schedule";
import { countWords } from "../lib/text";
import { Emailer } from "../lib/email";
import type { Db } from "./tournament-service";

export function randomSeed(): number {
  return randomBytes(4).readUInt32BE(0);
}

/** The are-you-still-here window after a round's clock expires (SPEC §4). */
export const GRACE_S = 60;

async function audit(db: Db, tournamentId: string, action: string, payload: unknown): Promise<void> {
  await db.insert(auditLog).values({ tournamentId, action, payload });
}

async function postSystem(db: Db, tournamentId: string, body: string, mergeId?: string): Promise<void> {
  const [room] = await db
    .select()
    .from(chatRooms)
    .where(
      mergeId
        ? and(eq(chatRooms.tournamentId, tournamentId), eq(chatRooms.kind, "merge"), eq(chatRooms.subjectId, mergeId))
        : and(eq(chatRooms.tournamentId, tournamentId), eq(chatRooms.kind, "global"))
    );
  if (room) await db.insert(messages).values({ roomId: room.id, kind: "system", body });
}

async function requireTournament(db: Db, id: string): Promise<Tournament> {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!t) throw new Error("tournament not found");
  return t;
}

/** Effective seconds since Begin at wall-clock `now`. */
export function effectiveT(t: Tournament, now: Date): number {
  if (!t.begunAt) throw new Error("tournament has not begun");
  return effectiveNow(now.getTime(), t.begunAt.getTime(), t.totalPausedS, t.pausedAt?.getTime());
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export async function publishBracket(
  db: Db,
  emailer: Emailer,
  baseUrl: string,
  tournamentId: string,
  seedOverride?: number
) {
  const t = await requireTournament(db, tournamentId);
  if (t.phase !== "submission") throw new Error("bracket can only be published from the submission phase");

  const drafts = await db
    .select()
    .from(textVersions)
    .where(and(eq(textVersions.tournamentId, tournamentId), eq(textVersions.kind, "draft")))
    .orderBy(asc(textVersions.createdAt));
  if (drafts.length < 2) throw new Error(`need at least 2 submitted drafts, have ${drafts.length}`);

  const n = drafts.length;
  // Commit-reveal: all randomness derives from a secret whose hash is
  // published now and which is revealed at completion.
  const masterSecret = makeMasterSecret();
  const commitment = commitmentOf(masterSecret);
  const seed = seedOverride ?? deriveSeed(masterSecret, "placement");
  const bracket = buildBracket(n);
  const seeded = seedBracket(drafts, mulberry32(seed));

  const starts = scheduledStarts({
    numRounds: bracket.rounds.length,
    roundDurationS: t.roundDurationS,
    breakDurationS: t.breakDurationS,
  });
  for (let r = 1; r <= bracket.rounds.length; r++) {
    await db.insert(rounds).values({ tournamentId, number: r, scheduledStartS: starts[r - 1] });
  }

  const slotIds = new Map<string, string>(); // "round:position" -> slot id
  for (const roundSlots of bracket.rounds) {
    for (const s of roundSlots) {
      const [row] = await db
        .insert(slots)
        .values({ tournamentId, roundNo: s.round, position: s.index, kind: s.kind })
        .returning();
      slotIds.set(`${s.round}:${s.index}`, row.id);
    }
  }

  // Round 1: merges get their input texts and bearers; byes pass through now.
  for (const s of bracket.rounds[0]) {
    const slotId = slotIds.get(`1:${s.index}`)!;
    if (s.kind === "bye") {
      const d = seeded[s.feeders[0]];
      await db
        .update(slots)
        .set({ outState: "filled", outTextId: d.id, outBearerId: d.authorId })
        .where(eq(slots.id, slotId));
      continue;
    }
    const [fa, fb] = s.feeders as [number, number];
    const a = seeded[fa];
    const b = seeded[fb];
    const [m] = await db
      .insert(merges)
      .values({ slotId, textAId: a.id, textBId: b.id, bearerAId: a.authorId, bearerBId: b.authorId })
      .returning();
    await db.insert(chatRooms).values({ tournamentId, kind: "merge", subjectId: m.id });
  }

  await db
    .update(tournaments)
    .set({ phase: "convening", seed, masterSecret })
    .where(eq(tournaments.id, tournamentId));
  await audit(db, tournamentId, "bracket_published", {
    n,
    seed,
    placement: seeded.map((d) => d.id),
    seedCommitment: commitment,
  });
  await postSystem(
    db,
    tournamentId,
    `The bracket is published: ${n} drafts, ${bracket.rounds.length} rounds. ` +
      `Randomness commitment: ${commitment} (the seed behind every coin flip is fixed now and revealed at the end).`
  );

  const roster = await db.select().from(participants).where(eq(participants.tournamentId, tournamentId));
  for (const p of roster) {
    await emailer.send({
      to: p.email,
      subject: `${t.name}: the bracket is published`,
      text: `The tournament is convening. See the bracket, read the drafts, and find your first partner:\n\n${baseUrl}/${t.slug}`,
    });
  }
  return { n, seed, numRounds: bracket.rounds.length };
}

// ---------------------------------------------------------------------------
// Begin / pause
// ---------------------------------------------------------------------------

export async function beginTournament(db: Db, tournamentId: string, now: Date) {
  const t = await requireTournament(db, tournamentId);
  if (t.phase !== "convening") throw new Error("begin is only available while convening");
  await db.update(tournaments).set({ phase: "running", begunAt: now }).where(eq(tournaments.id, tournamentId));
  await openRound(db, tournamentId, 1, 0);
  await audit(db, tournamentId, "begin", { at: now.toISOString() });
  await postSystem(db, tournamentId, "Begin! Round 1 is open.");
}

export async function pauseTournament(db: Db, tournamentId: string, now: Date) {
  const t = await requireTournament(db, tournamentId);
  if (t.phase !== "running" || t.pausedAt) throw new Error("nothing to pause");
  await db.update(tournaments).set({ pausedAt: now }).where(eq(tournaments.id, tournamentId));
  await audit(db, tournamentId, "pause", { at: now.toISOString() });
  await postSystem(db, tournamentId, "Tournament paused by the admin.");
}

export async function unpauseTournament(db: Db, tournamentId: string, now: Date) {
  const t = await requireTournament(db, tournamentId);
  if (t.phase !== "running" || !t.pausedAt) throw new Error("not paused");
  const pausedS = Math.round((now.getTime() - t.pausedAt.getTime()) / 1000);
  await db
    .update(tournaments)
    .set({ pausedAt: null, totalPausedS: t.totalPausedS + pausedS })
    .where(eq(tournaments.id, tournamentId));
  await audit(db, tournamentId, "unpause", { at: now.toISOString(), pausedS });
  await postSystem(db, tournamentId, `Tournament resumed after a ${pausedS}s pause.`);
}

// ---------------------------------------------------------------------------
// Merge actions (bearers)
// ---------------------------------------------------------------------------

function rowToSession(m: Merge): MergeSession {
  return {
    lock: m.state === "locked" || m.state === "resolved" ? "locked" : m.proposedBy ? "proposed" : "editing",
    proposedBy: m.state === "open" ? m.proposedBy : null,
    workingText: m.workingText,
    bearerPref: { A: m.bearerPrefA, B: m.bearerPrefB },
    active: { A: m.activeA, B: m.activeB },
  };
}

export type WorkspaceAction =
  | { type: "edit"; text: string }
  | { type: "propose" }
  | { type: "confirm" }
  | { type: "keepEditing" }
  | { type: "selectBearer"; pref: Side }
  // During the are-you-still-here window only:
  | { type: "stillHere" }
  | { type: "chooseAdvance"; choice: "working" | "input" }
  // During the break before the merge's round opens:
  | { type: "readyForRound" };

export async function mergeAction(
  db: Db,
  mergeId: string,
  participantId: string,
  action: WorkspaceAction,
  now: Date
) {
  const [m] = await db.select().from(merges).where(eq(merges.id, mergeId));
  if (!m) throw new Error("merge not found");
  const [slot] = await db.select().from(slots).where(eq(slots.id, m.slotId));
  const t = await requireTournament(db, slot.tournamentId);
  if (t.phase !== "running") throw new Error("the tournament is not running");
  if (t.pausedAt) throw new Error("the tournament is paused");
  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.tournamentId, t.id), eq(rounds.number, slot.roundNo)));
  const side: Side | null = m.bearerAId === participantId ? "A" : m.bearerBId === participantId ? "B" : null;
  if (!side) throw new Error("only this merge's bearers may act on it");

  // Break-time readiness (SPEC deviation agreed with Ed): a pending merge's
  // bearer confirms they're present, which lets the round start early.
  if (action.type === "readyForRound") {
    if (m.state !== "pending" || round.state !== "scheduled") {
      throw new Error("readiness applies before the round opens");
    }
    await db
      .update(merges)
      .set(side === "A" ? { readyA: true } : { readyB: true })
      .where(eq(merges.id, mergeId));
    return;
  }

  if (m.state !== "open") throw new Error("this merge is no longer editable");

  // Window actions: presence and advance-choice, only while the round is closing.
  if (action.type === "stillHere" || action.type === "chooseAdvance") {
    if (round.state !== "closing") throw new Error("the backstop window is not open");
    const patch: Partial<typeof merges.$inferInsert> =
      side === "A" ? { activeA: true } : { activeB: true };
    if (action.type === "chooseAdvance") {
      if (side === "A") patch.activeChoiceA = action.choice;
      else patch.activeChoiceB = action.choice;
    }
    await db.update(merges).set(patch).where(eq(merges.id, mergeId));
    return;
  }

  if (round.state !== "open") throw new Error("this round is not open");

  const session = applyAction(rowToSession(m), { ...action, side } as MergeAction);
  await db
    .update(merges)
    .set({
      workingText: session.workingText,
      proposedBy: session.proposedBy,
      bearerPrefA: session.bearerPref.A,
      bearerPrefB: session.bearerPref.B,
      activeA: session.active.A,
      activeB: session.active.B,
      state: session.lock === "locked" ? "locked" : "open",
      lockedAt: session.lock === "locked" ? now : null,
    })
    .where(eq(merges.id, mergeId));

  if (session.lock === "locked") {
    await finalizeMerge(db, t, { ...m, ...sessionColumns(session), state: "locked" }, session);
  }
}

function sessionColumns(s: MergeSession) {
  return {
    workingText: s.workingText,
    proposedBy: s.proposedBy,
    bearerPrefA: s.bearerPref.A,
    bearerPrefB: s.bearerPref.B,
    activeA: s.active.A,
    activeB: s.active.B,
  };
}

// ---------------------------------------------------------------------------
// Resolution plumbing
// ---------------------------------------------------------------------------

const KIND_TO_DB = {
  AGREED: "agreed",
  BEARER_FLIP: "bearer_flip",
  BACKSTOP_FLIP: "backstop_flip",
  ACTIVE_ADVANCE: "active_advance",
  ABANDONED: "abandoned",
} as const;

/**
 * Resolve a merge whose session state is final (locked, or at backstop).
 * Inputs are passed to the engine as opaque text-version ids; a new
 * TextVersion is only created when the working text itself advances.
 */
async function finalizeMerge(db: Db, t: Tournament, m: Merge, session: MergeSession): Promise<void> {
  if (!m.textAId || !m.textBId || !m.bearerAId || !m.bearerBId) throw new Error("merge is missing inputs");
  const a: MergeInput = { text: m.textAId, bearer: m.bearerAId };
  const b: MergeInput = { text: m.textBId, bearer: m.bearerBId };
  // The sole active bearer's window pick, if this resolves as ACTIVE_ADVANCE.
  const activeChoice =
    session.active.A && !session.active.B
      ? (m.activeChoiceA ?? null)
      : session.active.B && !session.active.A
        ? (m.activeChoiceB ?? null)
        : null;
  const flipSeed = t.masterSecret ? deriveSeed(t.masterSecret, `flip:${m.id}`) : randomSeed();
  const resolved: ResolvedMerge = resolveMerge(a, b, session, activeChoice, mulberry32(flipSeed));

  let resultTextId: string | null = null;
  if (resolved.advancing) {
    // Mirrors the engine: these are the resolutions that advance the
    // working text itself (as content); everything else advances an input id.
    const advancesWorking =
      resolved.kind === "AGREED" ||
      resolved.kind === "BEARER_FLIP" ||
      (resolved.kind === "ACTIVE_ADVANCE" && activeChoice === "working" && session.workingText.trim() !== "");
    if (advancesWorking) {
      const [version] = await db
        .insert(textVersions)
        .values({
          tournamentId: t.id,
          kind: "merge_result",
          bodyMd: session.workingText,
          wordCount: countWords(session.workingText),
          parentAId: m.textAId,
          parentBId: m.textBId,
        })
        .returning();
      resultTextId = version.id;
    } else {
      resultTextId = resolved.advancing.text; // an input advances intact
    }
  }

  await db
    .update(merges)
    .set({
      state: "resolved",
      resolution: KIND_TO_DB[resolved.kind as keyof typeof KIND_TO_DB],
      resultTextId,
      advancingBearerId: resolved.advancing?.bearer ?? null,
      flipSeed: resolved.flips.length > 0 ? flipSeed : null,
      resolvedAt: new Date(),
    })
    .where(eq(merges.id, m.id));
  await db
    .update(slots)
    .set(
      resolved.advancing
        ? { outState: "filled", outTextId: resultTextId, outBearerId: resolved.advancing.bearer }
        : { outState: "empty" }
    )
    .where(eq(slots.id, m.slotId));

  await audit(db, t.id, "merge_resolved", {
    mergeId: m.id,
    resolution: resolved.kind,
    flipSeed: resolved.flips.length > 0 ? flipSeed : null,
    resultTextId,
  });
  await postSystem(
    db,
    t.id,
    resolved.kind === "ABANDONED"
      ? "Neither bearer was present; this merge is abandoned."
      : `Merge resolved (${resolved.kind.toLowerCase().replace("_", " ")}).`,
    m.id
  );
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

async function openRound(db: Db, tournamentId: string, number: number, atS: number): Promise<void> {
  await db
    .update(rounds)
    .set({ state: "open", actualStartS: atS })
    .where(and(eq(rounds.tournamentId, tournamentId), eq(rounds.number, number)));
  const roundSlots = await db
    .select()
    .from(slots)
    .where(and(eq(slots.tournamentId, tournamentId), eq(slots.roundNo, number)));
  const slotIds = roundSlots.map((s) => s.id);
  if (slotIds.length > 0) {
    await db.update(merges).set({ state: "open" }).where(and(inArray(merges.slotId, slotIds), eq(merges.state, "pending")));
  }
  await postSystem(db, tournamentId, `Round ${number} is open.`);
}

/**
 * Advance the tournament to where it should be at wall-clock `now`.
 * Idempotent and crash-safe: state re-derives from rounds/merges/slots.
 * Returns true if any transition happened (callers use this to notify
 * live clients).
 */
export async function tick(db: Db, emailer: Emailer, baseUrl: string, tournamentId: string, now: Date): Promise<boolean> {
  const t = await requireTournament(db, tournamentId);
  if (t.phase !== "running" || t.pausedAt) return false;
  const te = effectiveT(t, now);
  let changed = false;

  const allRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, tournamentId))
    .orderBy(asc(rounds.number));
  const bracket = await bracketFor(db, tournamentId);

  for (let guard = 0; guard < 200; guard++) {
    const current = allRounds.find((r) => r.state !== "closed");
    if (!current) return changed;

    if (current.state === "scheduled") {
      const prev = allRounds[current.number - 2];
      const earliest = current.number === 1 ? 0 : (prev.actualCloseS ?? 0) + t.breakDurationS;
      if (te < earliest) return changed;
      // The full-schedule guarantee: a round only starts before its printed
      // time when every bearer it requires has confirmed readiness during
      // the break (agreed with Ed: nobody gets ambushed by an early start).
      const guaranteed = Math.max(earliest, current.scheduledStartS);
      let openAt: number;
      if (te >= guaranteed) {
        openAt = guaranteed;
      } else if (await allBearersReady(db, tournamentId, current.number)) {
        openAt = Math.max(earliest, Math.round(te));
      } else {
        return changed;
      }
      await openRound(db, tournamentId, current.number, openAt);
      current.state = "open";
      current.actualStartS = openAt;
      changed = true;
      continue;
    }

    // current.state === "open" | "closing"
    const roundSlots = await db
      .select()
      .from(slots)
      .where(and(eq(slots.tournamentId, tournamentId), eq(slots.roundNo, current.number)))
      .orderBy(asc(slots.position));
    const slotIds = roundSlots.map((s) => s.id);
    const roundMerges = slotIds.length
      ? await db.select().from(merges).where(inArray(merges.slotId, slotIds))
      : [];
    const unresolved = roundMerges.filter((m) => m.state !== "resolved");
    const expiry = (current.actualStartS ?? 0) + t.roundDurationS;
    const graceEnd = expiry + GRACE_S;

    if (unresolved.length > 0) {
      if (current.state === "open") {
        if (te < expiry) return changed;
        // Clock expired with merges unresolved: freeze editing and open the
        // are-you-still-here window (SPEC §4).
        await db.update(rounds).set({ state: "closing" }).where(eq(rounds.id, current.id));
        current.state = "closing";
        changed = true;
        await audit(db, tournamentId, "backstop_window_opened", { round: current.number, atS: expiry });
        await postSystem(
          db,
          tournamentId,
          `Round ${current.number}: time is up. Unresolved merges have ${GRACE_S} seconds — are you still here?`
        );
        continue;
      }
      // current.state === "closing"
      if (te < graceEnd) return changed;
      // Window over: the backstop resolves everything still open.
      for (const m of unresolved) {
        await finalizeMerge(db, t, m, rowToSession(m));
      }
    }
    // Integer column: effective time is fractional, schedule points are whole seconds.
    const closeAt =
      unresolved.length > 0 ? graceEnd : Math.max(Math.round(te), current.actualStartS ?? 0);
    await db
      .update(rounds)
      .set({ state: "closed", actualCloseS: closeAt })
      .where(eq(rounds.id, current.id));
    current.state = "closed";
    current.actualCloseS = closeAt;
    changed = true;
    await audit(db, tournamentId, "round_closed", { round: current.number, atS: closeAt });
    await postSystem(db, tournamentId, `Round ${current.number} has closed.`);

    if (current.number === allRounds.length) {
      await completeTournament(db, emailer, baseUrl, t);
      return true;
    }
    await populateRound(db, t, bracket, current.number + 1);
  }
  throw new Error("tick failed to converge");
}

/** True when every pending merge of the round has both bearers confirmed ready. */
async function allBearersReady(db: Db, tournamentId: string, roundNo: number): Promise<boolean> {
  const roundSlots = await db
    .select({ id: slots.id })
    .from(slots)
    .where(and(eq(slots.tournamentId, tournamentId), eq(slots.roundNo, roundNo)));
  if (roundSlots.length === 0) return true;
  const pending = await db
    .select()
    .from(merges)
    .where(and(inArray(merges.slotId, roundSlots.map((s) => s.id)), eq(merges.state, "pending")));
  return pending.every((m) => m.readyA && m.readyB);
}

async function bracketFor(db: Db, tournamentId: string): Promise<Bracket> {
  const drafts = await db
    .select({ id: textVersions.id })
    .from(textVersions)
    .where(and(eq(textVersions.tournamentId, tournamentId), eq(textVersions.kind, "draft")));
  return buildBracket(drafts.length);
}

/** Build the next round's merges from the previous round's slot outputs. */
async function populateRound(db: Db, t: Tournament, bracket: Bracket, roundNo: number): Promise<void> {
  const prevSlots = await db
    .select()
    .from(slots)
    .where(and(eq(slots.tournamentId, t.id), eq(slots.roundNo, roundNo - 1)))
    .orderBy(asc(slots.position));
  const incoming: (TextEntry | null)[] = prevSlots.map((s) =>
    s.outState === "filled" && s.outTextId && s.outBearerId
      ? { text: s.outTextId, bearer: s.outBearerId }
      : null
  );

  const roundSeed = t.masterSecret ? deriveSeed(t.masterSecret, `round:${roundNo}`) : randomSeed();
  const plan = planRound(bracket.rounds[roundNo - 1], incoming, mulberry32(roundSeed));

  const thisRoundSlots = await db
    .select()
    .from(slots)
    .where(and(eq(slots.tournamentId, t.id), eq(slots.roundNo, roundNo)))
    .orderBy(asc(slots.position));
  const byPosition = new Map(thisRoundSlots.map((s) => [s.position, s]));

  const plannedSlots = new Set<number>();
  for (const [slotIndex, pair] of plan.merges) {
    plannedSlots.add(slotIndex);
    const slot = byPosition.get(slotIndex)!;
    const [m] = await db
      .insert(merges)
      .values({ slotId: slot.id, textAId: pair.a.text, textBId: pair.b.text, bearerAId: pair.a.bearer, bearerBId: pair.b.bearer })
      .returning();
    await db.insert(chatRooms).values({ tournamentId: t.id, kind: "merge", subjectId: m.id });
  }
  for (const adhoc of plan.adHoc) {
    plannedSlots.add(adhoc.resultSlot);
    plannedSlots.add(adhoc.vacatedSlot);
    const slot = byPosition.get(adhoc.resultSlot)!;
    const [m] = await db
      .insert(merges)
      .values({
        slotId: slot.id,
        isAdHoc: true,
        textAId: adhoc.a.text,
        textBId: adhoc.b.text,
        bearerAId: adhoc.a.bearer,
        bearerBId: adhoc.b.bearer,
      })
      .returning();
    await db.insert(chatRooms).values({ tournamentId: t.id, kind: "merge", subjectId: m.id });
    await db.update(slots).set({ outState: "empty" }).where(eq(slots.id, byPosition.get(adhoc.vacatedSlot)!.id));
    await postSystem(db, t.id, `Two idle texts have been paired into an ad-hoc merge in round ${roundNo}.`);
  }
  for (const [slotIndex, entry] of plan.standOver) {
    plannedSlots.add(slotIndex);
    await db
      .update(slots)
      .set({ outState: "filled", outTextId: entry.text, outBearerId: entry.bearer })
      .where(eq(slots.id, byPosition.get(slotIndex)!.id));
  }
  for (const slot of thisRoundSlots) {
    if (!plannedSlots.has(slot.position)) {
      await db.update(slots).set({ outState: "empty" }).where(eq(slots.id, slot.id));
    }
  }
  await audit(db, t.id, "round_populated", {
    round: roundNo,
    roundSeed,
    scheduledMerges: [...plan.merges.keys()],
    adHoc: plan.adHoc.map((x) => ({ slots: [x.slotA, x.slotB], resultSlot: x.resultSlot })),
    standOver: [...plan.standOver.keys()],
  });
}

async function completeTournament(db: Db, emailer: Emailer, baseUrl: string, t: Tournament): Promise<void> {
  await db.update(tournaments).set({ phase: "complete" }).where(eq(tournaments.id, t.id));
  const finalRoundNo = (await db.select().from(rounds).where(eq(rounds.tournamentId, t.id))).length;
  const [finalSlot] = await db
    .select()
    .from(slots)
    .where(and(eq(slots.tournamentId, t.id), eq(slots.roundNo, finalRoundNo)));
  const canonical =
    finalSlot?.outState === "filled" && finalSlot.outTextId
      ? (await db.select().from(textVersions).where(eq(textVersions.id, finalSlot.outTextId)))[0]
      : null;

  await audit(db, t.id, "tournament_complete", { canonicalTextId: canonical?.id ?? null });
  if (t.masterSecret) {
    await audit(db, t.id, "seed_reveal", {
      masterSecret: t.masterSecret,
      commitment: commitmentOf(t.masterSecret),
    });
    await postSystem(
      db,
      t.id,
      `Randomness revealed: the master seed was ${t.masterSecret} — hash it to check the commitment from publication, and every flip can be recomputed from the audit log.`
    );
  }
  await postSystem(
    db,
    t.id,
    canonical ? "The tournament is complete: a canonical text has emerged." : "The tournament concluded with no canonical text."
  );
  const roster = await db.select().from(participants).where(eq(participants.tournamentId, t.id));
  for (const p of roster) {
    await emailer.send({
      to: p.email,
      subject: `${t.name}: the tournament is complete`,
      text: canonical
        ? `The canonical text:\n\n${baseUrl}/${t.slug}\n\n---\n\n${canonical.bodyMd}`
        : `The tournament concluded with no canonical text.\n\n${baseUrl}/${t.slug}`,
    });
  }
}
