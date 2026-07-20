import { beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { createTestDb, TestDb } from "../db/test-db";
import { auditLog, merges, participants, rounds, slots, textVersions, tournaments } from "../db/schema";
import type { Email, Emailer } from "../lib/email";
import {
  beginTournament,
  mergeAction,
  pauseTournament,
  publishBracket,
  tick,
  unpauseTournament,
} from "./runtime-service";
import { addParticipant, createTournament, saveDraft } from "./tournament-service";

class CaptureEmailer implements Emailer {
  sent: Email[] = [];
  async send(email: Email) {
    this.sent.push(email);
  }
}

let db: TestDb;
const BASE = "https://mergetournament.org";
const T0 = new Date("2026-07-18T10:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

beforeAll(async () => {
  ({ db } = await createTestDb());
});

async function setup(slug: string, n: number, emailer: Emailer) {
  const t = await createTournament(db, { slug, name: slug, roundDurationS: 600, breakDurationS: 300 });
  await addParticipant(db, emailer, BASE, t.id, { name: "Admin", email: `admin@${slug}.org`, role: "admin" });
  const people = [];
  for (let i = 0; i < n; i++) {
    const p = await addParticipant(db, emailer, BASE, t.id, { name: `P${i}`, email: `p${i}@${slug}.org` });
    await saveDraft(db, p.id, `Draft ${i} from P${i}.`);
    people.push(p);
  }
  return { t, people };
}

async function mergesOfRound(tournamentId: string, roundNo: number) {
  const roundSlots = await db
    .select()
    .from(slots)
    .where(and(eq(slots.tournamentId, tournamentId), eq(slots.roundNo, roundNo)))
    .orderBy(asc(slots.position));
  const out = [];
  for (const s of roundSlots) {
    const rows = await db.select().from(merges).where(eq(merges.slotId, s.id));
    for (const m of rows) out.push({ slot: s, merge: m });
  }
  return out;
}

/** Lock a merge in consensually: A edits, proposes; both prefer A; B confirms. */
async function agreeMerge(mergeId: string, a: string, b: string, text: string, now: Date) {
  await mergeAction(db, mergeId, a, { type: "edit", text }, now);
  await mergeAction(db, mergeId, a, { type: "selectBearer", pref: "A" }, now);
  await mergeAction(db, mergeId, b, { type: "selectBearer", pref: "A" }, now);
  await mergeAction(db, mergeId, a, { type: "propose" }, now);
  await mergeAction(db, mergeId, b, { type: "confirm" }, now);
}

describe("full tournament: 5 drafts, agreement, abandonment, ad-hoc idle-matching", () => {
  const emailer = new CaptureEmailer();

  it("publishes the bracket: rounds, slots, round-1 merges, bye pass-through, emails", async () => {
    const { t } = await setup("run5", 5, emailer);
    emailer.sent = [];
    const result = await publishBracket(db, emailer, BASE, t.id, 42);
    expect(result).toEqual({ n: 5, seed: 42, numRounds: 3 });

    const [row] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(row.phase).toBe("convening");
    expect(row.seed).toBe(42);

    const allRounds = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id)).orderBy(asc(rounds.number));
    expect(allRounds.map((r) => r.scheduledStartS)).toEqual([0, 900, 1800]);

    const r1 = await mergesOfRound(t.id, 1);
    expect(r1).toHaveLength(2);
    const byeSlots = await db
      .select()
      .from(slots)
      .where(and(eq(slots.tournamentId, t.id), eq(slots.roundNo, 1), eq(slots.kind, "bye")));
    expect(byeSlots).toHaveLength(1);
    expect(byeSlots[0].outState).toBe("filled");

    expect(emailer.sent).toHaveLength(6); // admin + 5 participants
    expect(emailer.sent[0].subject).toContain("bracket is published");
  });

  it("runs to completion through agreement, backstop abandonment, and an ad-hoc merge", async () => {
    const [t] = await db.select().from(tournaments).where(eq(tournaments.slug, "run5"));
    await beginTournament(db, t.id, T0);

    let r1 = await mergesOfRound(t.id, 1);
    expect(r1.every(({ merge }) => merge.state === "open")).toBe(true);

    // First merge: consensual agreement. Second merge: nobody shows up.
    const m1 = r1[0].merge;
    await agreeMerge(m1.id, m1.bearerAId!, m1.bearerBId!, "United text of round one.", at(60));

    r1 = await mergesOfRound(t.id, 1);
    expect(r1[0].merge.state).toBe("resolved");
    expect(r1[0].merge.resolution).toBe("agreed");
    expect(r1[0].merge.advancingBearerId).toBe(m1.bearerAId);
    expect(r1[0].slot.outState).toBe("filled");

    const [resultText] = await db.select().from(textVersions).where(eq(textVersions.id, r1[0].merge.resultTextId!));
    expect(resultText.kind).toBe("merge_result");
    expect(resultText.parentAId).toBe(m1.textAId);
    expect(resultText.parentBId).toBe(m1.textBId);

    // Round clock expires: first the 60s are-you-still-here window opens…
    await tick(db, emailer, BASE, t.id, at(600));
    let allRounds = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id)).orderBy(asc(rounds.number));
    expect(allRounds[0].state).toBe("closing");
    r1 = await mergesOfRound(t.id, 1);
    expect(r1[1].merge.state).toBe("open");
    // …editing is frozen during the window…
    await expect(
      mergeAction(db, r1[1].merge.id, r1[1].merge.bearerAId!, { type: "edit", text: "late!" }, at(610))
    ).rejects.toThrow(/not open/);
    // …then the untouched merge is abandoned and the round closes at expiry + 60.
    await tick(db, emailer, BASE, t.id, at(660));
    r1 = await mergesOfRound(t.id, 1);
    expect(r1[1].merge.state).toBe("resolved");
    expect(r1[1].merge.resolution).toBe("abandoned");
    expect(r1[1].slot.outState).toBe("empty");

    allRounds = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id)).orderBy(asc(rounds.number));
    expect(allRounds[0].state).toBe("closed");
    expect(allRounds[0].actualCloseS).toBe(660);

    // Round 2: the agreed result arrives by walkover, the bye draft is idle too
    // -> they pair into one ad-hoc merge; the vacated slot propagates empty.
    const r2 = await mergesOfRound(t.id, 2);
    expect(r2).toHaveLength(1);
    expect(r2[0].merge.isAdHoc).toBe(true);
    expect(r2[0].merge.state).toBe("pending");

    // Break passes; round 2 opens at close (660) + break (300) = 960.
    await tick(db, emailer, BASE, t.id, at(959));
    expect((await mergesOfRound(t.id, 2))[0].merge.state).toBe("pending");
    await tick(db, emailer, BASE, t.id, at(960));
    const adhoc = (await mergesOfRound(t.id, 2))[0].merge;
    expect(adhoc.state).toBe("open");

    // The ad-hoc pair agrees; the round closes early (1010), but the final —
    // a walkover — still waits out the break and opens at 1010 + 300 = 1310,
    // closing instantly since it has no merges to run.
    await agreeMerge(adhoc.id, adhoc.bearerAId!, adhoc.bearerBId!, "The final canonical text.", at(1000));
    emailer.sent = [];
    // Fractional wall-clock instant: early-close times must round to integers.
    await tick(db, emailer, BASE, t.id, at(1010.437));
    const [stillRunning] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(stillRunning.phase).toBe("running");
    const closedEarly = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id)).orderBy(asc(rounds.number));
    expect(closedEarly[1].state).toBe("closed");
    expect(closedEarly[1].actualCloseS).toBe(1010);

    await tick(db, emailer, BASE, t.id, at(1309));
    expect(
      (await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0].phase
    ).toBe("running");
    await tick(db, emailer, BASE, t.id, at(1310));

    const [done] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(done.phase).toBe("complete");
    const finalSlot = (
      await db.select().from(slots).where(and(eq(slots.tournamentId, t.id), eq(slots.roundNo, 3)))
    )[0];
    expect(finalSlot.outState).toBe("filled");
    const [canonical] = await db.select().from(textVersions).where(eq(textVersions.id, finalSlot.outTextId!));
    expect(canonical.bodyMd).toBe("The final canonical text.");

    expect(emailer.sent).toHaveLength(6);
    expect(emailer.sent[0].text).toContain("The final canonical text.");

    const log = await db.select().from(auditLog).where(eq(auditLog.tournamentId, t.id)).orderBy(asc(auditLog.id));
    const actions = log.map((e) => e.action);
    expect(actions).toContain("bracket_published");
    expect(actions).toContain("begin");
    expect(actions.filter((a) => a === "merge_resolved")).toHaveLength(3);
    expect(actions.filter((a) => a === "round_closed")).toHaveLength(3);
    expect(actions.filter((a) => a === "round_populated")).toHaveLength(2);
    expect(actions).toContain("tournament_complete");
  });
});

describe("the are-you-still-here window", () => {
  it("lets a sole active bearer advance the working text by choice", async () => {
    const emailer = new CaptureEmailer();
    const { t } = await setup("grace1", 2, emailer);
    await publishBracket(db, emailer, BASE, t.id, 11);
    await beginTournament(db, t.id, T0);
    const [{ merge }] = await mergesOfRound(t.id, 1);

    // A works alone; B never shows up.
    await mergeAction(db, merge.id, merge.bearerAId!, { type: "edit", text: "A's compromise draft" }, at(100));
    await expect(
      mergeAction(db, merge.id, merge.bearerAId!, { type: "stillHere" }, at(200))
    ).rejects.toThrow(/window is not open/);

    await tick(db, emailer, BASE, t.id, at(600));
    await mergeAction(db, merge.id, merge.bearerAId!, { type: "chooseAdvance", choice: "working" }, at(620));
    await tick(db, emailer, BASE, t.id, at(660));

    const [{ merge: resolved, slot }] = await mergesOfRound(t.id, 1);
    expect(resolved.resolution).toBe("active_advance");
    expect(slot.outState).toBe("filled");
    const [text] = await db.select().from(textVersions).where(eq(textVersions.id, resolved.resultTextId!));
    expect(text.bodyMd).toBe("A's compromise draft");
    expect(text.kind).toBe("merge_result");
    expect(text.parentAId).toBe(merge.textAId);
  });

  it("a returning bearer pressing YES restores the two-active coin flip", async () => {
    const emailer = new CaptureEmailer();
    const { t } = await setup("grace2", 2, emailer);
    await publishBracket(db, emailer, BASE, t.id, 12);
    await beginTournament(db, t.id, T0);
    const [{ merge }] = await mergesOfRound(t.id, 1);

    await mergeAction(db, merge.id, merge.bearerAId!, { type: "edit", text: "half-finished" }, at(100));
    await tick(db, emailer, BASE, t.id, at(600));
    // B was idle but is still in the room and presses YES.
    await mergeAction(db, merge.id, merge.bearerBId!, { type: "stillHere" }, at(630));
    await tick(db, emailer, BASE, t.id, at(660));

    const [{ merge: resolved }] = await mergesOfRound(t.id, 1);
    expect(resolved.resolution).toBe("backstop_flip");
    // An input advances intact — never the half-finished working text.
    expect([merge.textAId, merge.textBId]).toContain(resolved.resultTextId);
    expect(resolved.flipSeed).not.toBeNull();
  });
});

describe("pause and the no-canonical-text ending", () => {
  it("pausing stretches wall-clock deadlines; total abandonment completes with no text", async () => {
    const emailer = new CaptureEmailer();
    const { t } = await setup("run2", 2, emailer);
    await publishBracket(db, emailer, BASE, t.id, 7);
    await beginTournament(db, t.id, T0);

    await pauseTournament(db, t.id, at(100));
    await expect(
      (async () => {
        const [{ merge }] = await mergesOfRound(t.id, 1);
        await mergeAction(db, merge.id, merge.bearerAId!, { type: "propose" }, at(150));
      })()
    ).rejects.toThrow(/paused/);
    await unpauseTournament(db, t.id, at(200));

    // 100s paused: the round now expires at wall-clock 700, not 600.
    await tick(db, emailer, BASE, t.id, at(650));
    let allRounds = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id));
    expect(allRounds[0].state).toBe("open");

    // Expiry opens the window; the backstop resolves at wall 700 + 60.
    await tick(db, emailer, BASE, t.id, at(700));
    allRounds = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id));
    expect(allRounds[0].state).toBe("closing");
    await tick(db, emailer, BASE, t.id, at(760));
    allRounds = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id));
    expect(allRounds[0].state).toBe("closed");

    const [done] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(done.phase).toBe("complete");
    const [finalSlot] = await db.select().from(slots).where(eq(slots.tournamentId, t.id));
    expect(finalSlot.outState).toBe("empty");
    const last = emailer.sent.at(-1)!;
    expect(last.text).toContain("no canonical text");
  });
});
