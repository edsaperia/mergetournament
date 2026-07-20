import "server-only";
import { cache } from "react";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { merges, participants, rounds, slots, type Round, type Tournament } from "../db/schema";
import {
  globalRemainingS,
  roundRemainingS,
  type RoundProgress,
  type ScheduleConfig,
} from "../lib/schedule";
import { effectiveT, GRACE_S } from "../services/runtime-service";

/**
 * Per-request cached reads of a tournament's runtime rows, following the
 * session.ts pattern: sibling server components on one page (bracket, break
 * panel, notification bell…) share one query instead of re-issuing it, and
 * every SSE-triggered refresh pays for each read once.
 */

export const roundsFor = cache(async (tournamentId: string): Promise<Round[]> => {
  const db = await getDb();
  return db.select().from(rounds).where(eq(rounds.tournamentId, tournamentId)).orderBy(asc(rounds.number));
});

export const slotsFor = cache(async (tournamentId: string) => {
  const db = await getDb();
  return db
    .select()
    .from(slots)
    .where(eq(slots.tournamentId, tournamentId))
    .orderBy(asc(slots.roundNo), asc(slots.position));
});

export const mergesFor = cache(async (tournamentId: string) => {
  const allSlots = await slotsFor(tournamentId);
  if (allSlots.length === 0) return [];
  const db = await getDb();
  return db.select().from(merges).where(inArray(merges.slotId, allSlots.map((s) => s.id)));
});

export const rosterFor = cache(async (tournamentId: string) => {
  const db = await getDb();
  return db.select().from(participants).where(eq(participants.tournamentId, tournamentId));
});

export interface ScheduleContext {
  allRounds: Round[];
  config: ScheduleConfig;
  progress: RoundProgress[];
  /** Running with a Begin instant — countdowns are meaningful. */
  running: boolean;
  paused: boolean;
  /** Effective seconds since Begin (0 unless running). */
  te: number;
  /** Seconds left on an open round's clock. */
  remainingFor(roundNo: number): number;
  /** Seconds left in a closing round's are-you-still-here window. */
  backstopRemaining(round: Round): number;
  /** Seconds until the whole schedule completes. */
  globalRemaining(): number;
}

/**
 * The one place the round-timing math is assembled for rendering — the
 * tournament page, bracket, and merge workspace all read the clock through
 * this, so the backstop arithmetic exists exactly once.
 */
export async function scheduleContext(tournament: Tournament): Promise<ScheduleContext> {
  const allRounds = await roundsFor(tournament.id);
  const config: ScheduleConfig = {
    numRounds: allRounds.length,
    roundDurationS: tournament.roundDurationS,
    breakDurationS: tournament.breakDurationS,
  };
  const progress: RoundProgress[] = allRounds.map((r) => ({
    actualStart: r.actualStartS ?? undefined,
    actualClose: r.actualCloseS ?? undefined,
  }));
  const running = tournament.phase === "running" && Boolean(tournament.begunAt);
  const te = running ? effectiveT(tournament, new Date()) : 0;
  return {
    allRounds,
    config,
    progress,
    running,
    paused: Boolean(tournament.pausedAt),
    te,
    remainingFor: (roundNo) => roundRemainingS(config, progress, roundNo, te),
    backstopRemaining: (round) => (round.actualStartS ?? 0) + tournament.roundDurationS + GRACE_S - te,
    globalRemaining: () => globalRemainingS(config, progress, te),
  };
}
