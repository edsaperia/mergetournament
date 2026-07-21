import { beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { createTestDb, TestDb } from "../db/test-db";
import { merges, rounds, textVersions, tournaments } from "../db/schema";
import { ConsoleEmailer } from "../lib/email";
import { beginTournament, mergeAction, publishBracket, tick } from "../services/runtime-service";
import { addParticipant, createTournament, saveDraft } from "../services/tournament-service";
import { tickOnce, type TickerDeps } from "./ticker-core";

let db: TestDb;
const emailer = new ConsoleEmailer();
const T0 = new Date("2026-07-20T10:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

function makeDeps(overrides: Partial<TickerDeps> = {}): TickerDeps & { bumped: string[] } {
  const bumped: string[] = [];
  return {
    getDb: async () => db,
    emailer,
    baseUrl: "http://x",
    liveMergeIds: () => [],
    syncMergeText: async () => {},
    bump: (id) => bumped.push(id),
    bumped,
    ...overrides,
  };
}

async function publishTwoDrafts(slug: string) {
  const t = await createTournament(db, { slug, name: slug, roundDurationS: 600, breakDurationS: 60 });
  await addParticipant(db, emailer, "http://x", t.id, { name: "Admin", email: `a@${slug}.org`, role: "admin" });
  for (const name of ["P0", "P1"]) {
    const p = await addParticipant(db, emailer, "http://x", t.id, { name, email: `${name}@${slug}.org` });
    await saveDraft(db, p.id, `${name} draft`);
  }
  await publishBracket(db, emailer, "http://x", t.id);
  return t;
}

beforeAll(async () => {
  ({ db } = await createTestDb());
});

describe("tickOnce ordering", () => {
  it("auto-starts a scheduled tournament, then Round 1, in one pass", async () => {
    const emailer2 = new ConsoleEmailer();
    const t = await createTournament(db, { slug: "tick-auto", name: "Auto", roundDurationS: 600, breakDurationS: 60 });
    await addParticipant(db, emailer2, "http://x", t.id, { name: "Admin", email: "a@auto.org", role: "admin" });
    // publishAt due but only one draft: the ticker waits, quietly.
    const p0 = await addParticipant(db, emailer2, "http://x", t.id, { name: "P0", email: "p0@auto.org" });
    await saveDraft(db, p0.id, "P0 draft");
    await db.update(tournaments).set({ publishAt: at(-60), startAt: at(-5) }).where(eq(tournaments.id, t.id));
    await tickOnce(makeDeps(), T0);
    expect((await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0].phase).toBe("submission");

    // Second draft arrives: one pass takes it submission -> convening -> running.
    const p1 = await addParticipant(db, emailer2, "http://x", t.id, { name: "P1", email: "p1@auto.org" });
    await saveDraft(db, p1.id, "P1 draft");
    const deps = makeDeps();
    await tickOnce(deps, T0);
    const [row] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(row.phase).toBe("running");
    const [r1] = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id)).orderBy(asc(rounds.number));
    expect(r1.state).toBe("open");
    expect(deps.bumped).toContain(t.id);
  });

  it("auto-begins a due tournament and gives it its first tick in the same pass", async () => {
    const t = await publishTwoDrafts("tick-begin");
    await db.update(tournaments).set({ startAt: at(-5) }).where(eq(tournaments.id, t.id));

    const deps = makeDeps();
    await tickOnce(deps, T0);

    const [row] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(row.phase).toBe("running");
    const [r1] = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id)).orderBy(asc(rounds.number));
    expect(r1.state).toBe("open");
    expect(deps.bumped).toContain(t.id);
  });

  it("flushes live CRDT text before the backstop resolves on it", async () => {
    const t = await publishTwoDrafts("tick-flush");
    await beginTournament(db, t.id, T0);
    const [m] = await db
      .select({ id: merges.id, bearerAId: merges.bearerAId })
      .from(merges)
      .innerJoin(textVersions, eq(textVersions.id, merges.textAId))
      .where(eq(textVersions.tournamentId, t.id));

    // A works alone, then picks "advance the working text" in the window.
    await mergeAction(db, m.id, m.bearerAId!, { type: "edit", text: "stale snapshot" }, at(100));
    await tick(db, emailer, "http://x", t.id, at(600)); // clock expires -> closing
    await mergeAction(db, m.id, m.bearerAId!, { type: "chooseAdvance", choice: "working" }, at(620));

    // The live document is ahead of the debounced row; the pass must flush
    // it before the backstop resolves, or "stale snapshot" would advance.
    const deps = makeDeps({
      liveMergeIds: () => [m.id],
      syncMergeText: async (mergeId) => {
        await db.update(merges).set({ workingText: "fresh from the live doc" }).where(eq(merges.id, mergeId));
      },
    });
    await tickOnce(deps, at(660)); // grace over -> backstop resolves

    const [resolved] = await db.select().from(merges).where(eq(merges.id, m.id));
    expect(resolved.state).toBe("resolved");
    expect(resolved.resolution).toBe("active_advance");
    const [result] = await db.select().from(textVersions).where(eq(textVersions.id, resolved.resultTextId!));
    expect(result.bodyMd).toBe("fresh from the live doc");
    expect(deps.bumped).toContain(t.id);
  });

  it("a tournament whose tick throws does not stall the others", async () => {
    const broken = await publishTwoDrafts("tick-broken");
    await beginTournament(db, broken.id, T0);
    // Corrupt the commit-reveal invariant: the backstop's seed derivation
    // throws, and the whole transactional tick for this tournament rolls back.
    await db.update(tournaments).set({ masterSecret: null }).where(eq(tournaments.id, broken.id));

    const healthy = await publishTwoDrafts("tick-healthy");
    await beginTournament(db, healthy.id, T0);

    const deps = makeDeps();
    await tickOnce(deps, at(660)); // both rounds hit backstop resolution

    // Healthy ran its full backstop -> single round closed -> complete.
    const [done] = await db.select().from(tournaments).where(eq(tournaments.id, healthy.id));
    expect(done.phase).toBe("complete");
    expect(deps.bumped).toContain(healthy.id);
    // Broken rolled back atomically: still open, nothing half-closed, no bump.
    const [stuck] = await db.select().from(rounds).where(eq(rounds.tournamentId, broken.id));
    expect(stuck.state).toBe("open");
    expect(deps.bumped).not.toContain(broken.id);
  });
});
