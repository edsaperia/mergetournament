import { beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { createTestDb, TestDb } from "../db/test-db";
import { auditLog, chatRooms, merges, messages, participants, rounds, slots, textVersions, tournaments } from "../db/schema";
import type { Email, Emailer } from "../lib/email";
import {
  beginTournament,
  mergeAction,
  pauseTournament,
  publishBracket,
  tick,
  unpauseTournament,
} from "./runtime-service";
import { makeTournament } from "./test-fixture";

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
  const { t, people } = await makeTournament(db, {
    slug,
    participants: n,
    breakDurationS: 300,
    emailer,
    baseUrl: BASE,
  });
  return { t, people };
}

/** The system lines posted in a tournament's global chat, oldest first. */
async function globalSystemLines(tournamentId: string): Promise<string[]> {
  const [room] = await db
    .select()
    .from(chatRooms)
    .where(and(eq(chatRooms.tournamentId, tournamentId), eq(chatRooms.kind, "global")));
  const rows = await db.select().from(messages).where(eq(messages.roomId, room.id)).orderBy(asc(messages.seq));
  return rows.filter((m) => m.kind === "system").map((m) => m.body);
}

async function nameOfParticipant(id: string | null): Promise<string> {
  const [p] = await db.select().from(participants).where(eq(participants.id, id ?? ""));
  return p.name;
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
    const result = await publishBracket(db, emailer, BASE, t.id);
    expect(result.n).toBe(5);
    expect(result.numRounds).toBe(3);

    const [row] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(row.phase).toBe("convening");
    expect(row.seed).toBe(result.seed);

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
    expect(emailer.sent[0].subject).toContain("tournament has started");
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
    ).rejects.toThrow(/time is up/);
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
    // The chat names the two players, in plain words.
    const [pa, pb] = [await nameOfParticipant(r2[0].merge.bearerAId), await nameOfParticipant(r2[0].merge.bearerBId)];
    expect(await globalSystemLines(t.id)).toContain(`${pa} and ${pb} have no partner in round 2, so they merge with each other.`);

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
    // The final had no partner for it: the chat says so.
    const standsOver = `${await nameOfParticipant(finalSlot.outBearerId)}'s text has no partner in the final, so it becomes the final text.`;
    expect(await globalSystemLines(t.id)).toContain(standsOver);
    expect((await globalSystemLines(t.id)).join("\n")).not.toMatch(/idle|ad-hoc/);

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

describe("the final round", () => {
  it("locks in without bearer selection: no flip, no advancing bearer, canonical text emerges", async () => {
    const emailer = new CaptureEmailer();
    const { t } = await setup("final2", 2, emailer);
    await publishBracket(db, emailer, BASE, t.id);
    await beginTournament(db, t.id, T0);
    const [{ merge }] = await mergesOfRound(t.id, 1); // 2 drafts: round 1 is the final

    // Neither bearer states a preference — outside the final this would coin-flip.
    await mergeAction(db, merge.id, merge.bearerAId!, { type: "edit", text: "The canonical text." }, at(50));
    await mergeAction(db, merge.id, merge.bearerAId!, { type: "propose" }, at(60));
    await mergeAction(db, merge.id, merge.bearerBId!, { type: "confirm" }, at(70));

    const [{ merge: resolved, slot }] = await mergesOfRound(t.id, 1);
    expect(resolved.resolution).toBe("agreed");
    expect(resolved.advancingBearerId).toBeNull();
    expect(resolved.flipSeed).toBeNull();
    expect(slot.outState).toBe("filled");

    await tick(db, emailer, BASE, t.id, at(80));
    const [done] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(done.phase).toBe("complete");
    const [canonical] = await db.select().from(textVersions).where(eq(textVersions.id, resolved.resultTextId!));
    expect(canonical.bodyMd).toBe("The canonical text.");
  });
});

describe("the decision window", () => {
  it("lets a sole active bearer advance the working text by accepting", async () => {
    const emailer = new CaptureEmailer();
    const { t } = await setup("grace1", 2, emailer);
    await publishBracket(db, emailer, BASE, t.id);
    await beginTournament(db, t.id, T0);
    const [{ merge }] = await mergesOfRound(t.id, 1);

    // A works alone; B never shows up.
    await mergeAction(db, merge.id, merge.bearerAId!, { type: "edit", text: "A's compromise draft" }, at(100));
    await expect(
      mergeAction(db, merge.id, merge.bearerAId!, { type: "accept" }, at(200))
    ).rejects.toThrow(/window is not open/);

    await tick(db, emailer, BASE, t.id, at(600));
    await mergeAction(db, merge.id, merge.bearerAId!, { type: "accept" }, at(620));
    await tick(db, emailer, BASE, t.id, at(660));

    const [{ merge: resolved, slot }] = await mergesOfRound(t.id, 1);
    expect(resolved.resolution).toBe("active_advance");
    expect(resolved.activeChoiceA).toBe("working");
    expect(slot.outState).toBe("filled");
    const [text] = await db.select().from(textVersions).where(eq(textVersions.id, resolved.resultTextId!));
    expect(text.bodyMd).toBe("A's compromise draft");
    expect(text.kind).toBe("merge_result");
    expect(text.parentAId).toBe(merge.textAId);
  });

  it("a returning bearer pressing Reject restores the two-active coin flip", async () => {
    const emailer = new CaptureEmailer();
    const { t } = await setup("grace2", 2, emailer);
    await publishBracket(db, emailer, BASE, t.id);
    await beginTournament(db, t.id, T0);
    const [{ merge }] = await mergesOfRound(t.id, 1);

    await mergeAction(db, merge.id, merge.bearerAId!, { type: "edit", text: "half-finished" }, at(100));
    await tick(db, emailer, BASE, t.id, at(600));
    // B was idle but is still in the room and rejects the merge.
    await mergeAction(db, merge.id, merge.bearerBId!, { type: "reject" }, at(630));
    await tick(db, emailer, BASE, t.id, at(660));

    const [{ merge: resolved }] = await mergesOfRound(t.id, 1);
    expect(resolved.resolution).toBe("backstop_flip");
    // An input advances intact — never the half-finished working text.
    expect([merge.textAId, merge.textBId]).toContain(resolved.resultTextId);
    expect(resolved.flipSeed).not.toBeNull();
  });

  it("accepts a pre-clock proposal and a bearer choice after the clock, resolving at once", async () => {
    const emailer = new CaptureEmailer();
    // Four drafts, so round 1 is not the final and has a bearer to choose.
    const { t } = await setup("grace3", 4, emailer);
    await publishBracket(db, emailer, BASE, t.id);
    await beginTournament(db, t.id, T0);
    const [{ merge }] = await mergesOfRound(t.id, 1);

    await mergeAction(db, merge.id, merge.bearerAId!, { type: "edit", text: "agreed text" }, at(100));
    await mergeAction(db, merge.id, merge.bearerAId!, { type: "propose" }, at(590));
    await tick(db, emailer, BASE, t.id, at(600));
    // Too late to write, not too late to decide.
    await expect(
      mergeAction(db, merge.id, merge.bearerBId!, { type: "edit", text: "sneaky" }, at(610))
    ).rejects.toThrow(/time is up/);
    await mergeAction(db, merge.id, merge.bearerAId!, { type: "selectBearer", pref: "B" }, at(612));
    await mergeAction(db, merge.id, merge.bearerBId!, { type: "selectBearer", pref: "B" }, at(614));
    await mergeAction(db, merge.id, merge.bearerBId!, { type: "accept" }, at(616));

    // Resolved on the second accept, before the window ends.
    const [{ merge: resolved }] = await mergesOfRound(t.id, 1);
    expect(resolved.resolution).toBe("agreed");
    expect(resolved.advancingBearerId).toBe(merge.bearerBId);
    const [text] = await db.select().from(textVersions).where(eq(textVersions.id, resolved.resultTextId!));
    expect(text.bodyMd).toBe("agreed text");
  });

  it("a sole active bearer who rejects advances their own input", async () => {
    const emailer = new CaptureEmailer();
    const { t } = await setup("grace4", 2, emailer);
    await publishBracket(db, emailer, BASE, t.id);
    await beginTournament(db, t.id, T0);
    const [{ merge }] = await mergesOfRound(t.id, 1);

    await mergeAction(db, merge.id, merge.bearerAId!, { type: "edit", text: "A's attempt" }, at(100));
    await mergeAction(db, merge.id, merge.bearerAId!, { type: "propose" }, at(500));
    await tick(db, emailer, BASE, t.id, at(600));
    // A's pre-clock proposal was an accept; rejecting withdraws it.
    await mergeAction(db, merge.id, merge.bearerAId!, { type: "reject" }, at(620));
    await tick(db, emailer, BASE, t.id, at(660));

    const [{ merge: resolved }] = await mergesOfRound(t.id, 1);
    expect(resolved.resolution).toBe("active_advance");
    expect(resolved.resultTextId).toBe(merge.textAId);
    expect(resolved.advancingBearerId).toBe(merge.bearerAId);
    // The press is recorded, so the modal can show Reject as chosen.
    expect(resolved.activeChoiceA).toBe("input");
  });
});

describe("commit-reveal randomness", () => {
  it("commits a hash at publish, derives every draw from the secret, reveals at completion", async () => {
    const emailer = new CaptureEmailer();
    const { t } = await setup("reveal", 2, emailer);
    await publishBracket(db, emailer, BASE, t.id); // placement derives from the committed secret
    const [pub] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    const { commitmentOf, deriveSeed } = await import("../lib/commit");
    expect(pub.masterSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(pub.seed).toBe(deriveSeed(pub.masterSecret!, "placement"));

    const log1 = await db.select().from(auditLog).where(eq(auditLog.tournamentId, t.id)).orderBy(asc(auditLog.id));
    const published = log1.find((e) => e.action === "bracket_published")!;
    const commitment = (published.payload as { seedCommitment: string }).seedCommitment;
    expect(commitment).toBe(commitmentOf(pub.masterSecret!));

    // One bearer works, the other rejects in the window: a backstop flip.
    await beginTournament(db, t.id, T0);
    const [{ merge }] = await mergesOfRound(t.id, 1);
    await mergeAction(db, merge.id, merge.bearerAId!, { type: "edit", text: "solo work" }, at(100));
    await tick(db, emailer, BASE, t.id, at(600));
    await mergeAction(db, merge.id, merge.bearerBId!, { type: "reject" }, at(620));
    await tick(db, emailer, BASE, t.id, at(660));

    const [resolved] = await db.select().from(merges).where(eq(merges.id, merge.id));
    expect(resolved.resolution).toBe("backstop_flip");
    // The flip's seed is exactly the derived one — verifiable from the reveal.
    expect(resolved.flipSeed).toBe(deriveSeed(pub.masterSecret!, `flip:${merge.id}`));

    const log2 = await db.select().from(auditLog).where(eq(auditLog.tournamentId, t.id)).orderBy(asc(auditLog.id));
    const reveal = log2.find((e) => e.action === "seed_reveal")!;
    const payload = reveal.payload as { masterSecret: string; commitment: string };
    expect(payload.masterSecret).toBe(pub.masterSecret);
    expect(commitmentOf(payload.masterSecret)).toBe(commitment);
  });
});

describe("readiness-gated early starts", () => {
  async function earlyCloseRound1(slug: string, emailer: CaptureEmailer) {
    const { t } = await setup(slug, 4, emailer);
    await publishBracket(db, emailer, BASE, t.id);
    await beginTournament(db, t.id, T0);
    for (const { merge } of await mergesOfRound(t.id, 1)) {
      await agreeMerge(merge.id, merge.bearerAId!, merge.bearerBId!, `merged in ${slug}`, at(100));
    }
    await tick(db, emailer, BASE, t.id, at(110)); // round 1 closes early at 110
    const allRounds = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id)).orderBy(asc(rounds.number));
    expect(allRounds[0].state).toBe("closed");
    expect(allRounds[0].actualCloseS).toBe(110);
    return t;
  }

  it("opens early only once every next-round bearer is ready", async () => {
    const emailer = new CaptureEmailer();
    const t = await earlyCloseRound1("gate-yes", emailer);

    // Break over at 110 + 300 = 410, but nobody has confirmed: stays shut.
    await tick(db, emailer, BASE, t.id, at(500));
    let [, r2] = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id)).orderBy(asc(rounds.number));
    expect(r2.state).toBe("scheduled");

    const [{ merge: next }] = await mergesOfRound(t.id, 2);
    expect(next.state).toBe("pending");
    await mergeAction(db, next.id, next.bearerAId!, { type: "readyForRound" }, at(520));
    await tick(db, emailer, BASE, t.id, at(525));
    [, r2] = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id)).orderBy(asc(rounds.number));
    expect(r2.state).toBe("scheduled"); // one of two bearers ready

    await mergeAction(db, next.id, next.bearerBId!, { type: "readyForRound" }, at(530));
    await tick(db, emailer, BASE, t.id, at(535));
    [, r2] = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id)).orderBy(asc(rounds.number));
    expect(r2.state).toBe("open");
    expect(r2.actualStartS).toBe(535);
  });

  it("without readiness, the round waits for its printed schedule time", async () => {
    const emailer = new CaptureEmailer();
    const t = await earlyCloseRound1("gate-no", emailer);

    await tick(db, emailer, BASE, t.id, at(899));
    let [, r2] = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id)).orderBy(asc(rounds.number));
    expect(r2.state).toBe("scheduled");

    // Full-schedule guarantee: opens at exactly the published start (900).
    await tick(db, emailer, BASE, t.id, at(900));
    [, r2] = await db.select().from(rounds).where(eq(rounds.tournamentId, t.id)).orderBy(asc(rounds.number));
    expect(r2.state).toBe("open");
    expect(r2.actualStartS).toBe(900);

    // Readiness after the round opened is meaningless and rejected.
    const [{ merge }] = await mergesOfRound(t.id, 2);
    await expect(
      mergeAction(db, merge.id, merge.bearerAId!, { type: "readyForRound" }, at(910))
    ).rejects.toThrow(/before the round opens/);
  });
});

describe("pause and the no-canonical-text ending", () => {
  it("pausing stretches wall-clock deadlines; total abandonment completes with no text", async () => {
    const emailer = new CaptureEmailer();
    const { t } = await setup("run2", 2, emailer);
    await publishBracket(db, emailer, BASE, t.id);
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
