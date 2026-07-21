/**
 * One scheduler pass, framework-free (deps injected) so the ordering
 * guarantees are testable:
 *
 *   1. flush live CRDT texts — backstop resolutions must never act on a
 *      stale debounced row;
 *   2. auto-start tournaments whose scheduled Start Tournament time
 *      (publishAt) has arrived — skipped quietly until at least 2 drafts
 *      exist, since a bracket needs a pair;
 *   3. auto-begin convening tournaments whose Round 1 start time has
 *      arrived — a tournament that starts and is due to begin takes both
 *      steps and its first tick in the same pass;
 *   4. advance every running tournament — one failure is logged and skipped
 *      so it cannot stall the rest.
 */

import { and, count, eq } from "drizzle-orm";
import { textVersions, tournaments } from "../db/schema";
import type { Emailer } from "../lib/email";
import { beginTournament, publishBracket, tick } from "../services/runtime-service";
import type { Db } from "../services/tournament-service";

export interface TickerDeps {
  getDb(): Promise<Db>;
  emailer: Emailer;
  baseUrl: string;
  /** Merge ids whose CRDT documents are live in memory. */
  liveMergeIds(): string[];
  /** Persist one live document's text into its merge row. */
  syncMergeText(mergeId: string): Promise<void>;
  /** Nudge SSE clients of a tournament. */
  bump(tournamentId: string): void;
}

export async function tickOnce(deps: TickerDeps, now: Date): Promise<void> {
  const db = await deps.getDb();

  for (const mergeId of deps.liveMergeIds()) {
    await deps.syncMergeText(mergeId);
  }

  const submissionPhase = await db.select().from(tournaments).where(eq(tournaments.phase, "submission"));
  for (const t of submissionPhase) {
    if (!t.publishAt || t.publishAt.getTime() > now.getTime()) continue;
    const [{ drafts }] = await db
      .select({ drafts: count() })
      .from(textVersions)
      .where(and(eq(textVersions.tournamentId, t.id), eq(textVersions.kind, "draft")));
    if (drafts < 2) continue; // waits until a bracket is possible
    try {
      await publishBracket(db, deps.emailer, deps.baseUrl, t.id);
      deps.bump(t.id);
    } catch (e) {
      console.error(`[ticker] auto-start ${t.slug}:`, e);
    }
  }

  const convening = await db.select().from(tournaments).where(eq(tournaments.phase, "convening"));
  for (const t of convening) {
    if (t.startAt && t.startAt.getTime() <= now.getTime()) {
      try {
        await beginTournament(db, t.id, now);
        deps.bump(t.id);
      } catch (e) {
        console.error(`[ticker] auto-begin ${t.slug}:`, e);
      }
    }
  }

  const running = await db.select().from(tournaments).where(eq(tournaments.phase, "running"));
  for (const t of running) {
    try {
      const changed = await tick(db, deps.emailer, deps.baseUrl, t.id, now);
      if (changed) deps.bump(t.id);
    } catch (e) {
      console.error(`[ticker] tournament ${t.slug}:`, e);
    }
  }
}
