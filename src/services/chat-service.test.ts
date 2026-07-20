import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, TestDb } from "../db/test-db";
import { merges } from "../db/schema";
import { ConsoleEmailer } from "../lib/email";
import {
  addComment,
  commentsFor,
  globalRoom,
  messagesFor,
  postMessage,
  roomForMerge,
  roomForText,
} from "./chat-service";
import { beginTournament, mergeAction, publishBracket } from "./runtime-service";
import { addParticipant, createTournament, saveDraft } from "./tournament-service";

let db: TestDb;
let tournamentId: string;
let adminId: string;
let p0Id: string;
let draftId: string;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const emailer = new ConsoleEmailer();
  const t = await createTournament(db, { slug: "chat", name: "Chat", roundDurationS: 3600, breakDurationS: 60 });
  tournamentId = t.id;
  const admin = await addParticipant(db, emailer, "http://x", t.id, { name: "Admin", email: "a@chat.org", role: "admin" });
  adminId = admin.id;
  const p0 = await addParticipant(db, emailer, "http://x", t.id, { name: "P0", email: "p0@chat.org" });
  const p1 = await addParticipant(db, emailer, "http://x", t.id, { name: "P1", email: "p1@chat.org" });
  p0Id = p0.id;
  const d0 = await saveDraft(db, p0.id, "Line zero.\nLine one.\nLine two.");
  draftId = d0.id;
  await saveDraft(db, p1.id, "Other draft.");
  await publishBracket(db, emailer, "http://x", t.id, 5);
  await beginTournament(db, t.id, new Date());
});

describe("rooms", () => {
  it("has a global room carrying the system narrative", async () => {
    const room = await globalRoom(db, tournamentId);
    expect(room).not.toBeNull();
    const msgs = await messagesFor(db, room!.id);
    expect(msgs.some((m) => m.kind === "system" && m.body.includes("bracket is published"))).toBe(true);
    expect(msgs.some((m) => m.kind === "system" && m.body.includes("Round 1 is open"))).toBe(true);
  });

  it("a draft's chat travels with it; a merge result's chat is the producing merge's room", async () => {
    const draftRoom = await roomForText(db, draftId);
    expect(draftRoom?.kind).toBe("draft");
    expect(draftRoom?.subjectId).toBe(draftId);

    // Resolve the merge consensually, then check the result's room.
    const [m] = await db.select().from(merges);
    await mergeAction(db, m.id, m.bearerAId!, { type: "edit", text: "merged" }, new Date());
    await mergeAction(db, m.id, m.bearerAId!, { type: "selectBearer", pref: "A" }, new Date());
    await mergeAction(db, m.id, m.bearerBId!, { type: "selectBearer", pref: "A" }, new Date());
    await mergeAction(db, m.id, m.bearerAId!, { type: "propose" }, new Date());
    await mergeAction(db, m.id, m.bearerBId!, { type: "confirm" }, new Date());
    const [resolved] = await db.select().from(merges).where(eq(merges.id, m.id));
    const resultRoom = await roomForText(db, resolved.resultTextId!);
    const mergeRoom = await roomForMerge(db, m.id);
    expect(resultRoom?.id).toBe(mergeRoom?.id);
    // The merge chat received system events (lock-in resolution).
    const msgs = await messagesFor(db, mergeRoom!.id);
    expect(msgs.some((x) => x.kind === "system" && x.body.includes("resolved"))).toBe(true);
  });
});

describe("posting rules", () => {
  it("chat opens only when the bracket is published", async () => {
    const emailer = new ConsoleEmailer();
    const pre = await createTournament(db, { slug: "chat-pre", name: "Pre", roundDurationS: 600, breakDurationS: 60 });
    const p = await addParticipant(db, emailer, "http://x", pre.id, { name: "Q", email: "q@pre.org" });
    const room = await globalRoom(db, pre.id);
    await expect(postMessage(db, room!.id, p.id, "too early")).rejects.toThrow(/bracket is published/);
  });

  it("participants post anywhere; the admin only in global; attribution by name", async () => {
    const g = await globalRoom(db, tournamentId);
    const draftRoom = await roomForText(db, draftId);

    await postMessage(db, g!.id, p0Id, "hello all");
    await postMessage(db, draftRoom!.id, p0Id, "about this draft…");
    await postMessage(db, g!.id, adminId, "admin announcement");
    await expect(postMessage(db, draftRoom!.id, adminId, "sneaky")).rejects.toThrow(/only post in the global/);
    await expect(postMessage(db, g!.id, p0Id, "   ")).rejects.toThrow(/empty/);

    const msgs = await messagesFor(db, g!.id);
    const mine = msgs.filter((m) => m.kind === "user");
    expect(mine.map((m) => m.author)).toEqual(["P0", "Admin"]);
  });
});

describe("inline comments", () => {
  it("anchors named comments to lines, in range", async () => {
    await addComment(db, { textVersionId: draftId, authorId: p0Id, line: 1, body: "this line sings" });
    await expect(
      addComment(db, { textVersionId: draftId, authorId: adminId, line: 0, body: "formatting note" })
    ).rejects.toThrow(/does not comment/);
    await expect(addComment(db, { textVersionId: draftId, authorId: p0Id, line: 99, body: "x" })).rejects.toThrow(/range/);
    await expect(addComment(db, { textVersionId: draftId, authorId: p0Id, line: 1, body: " " })).rejects.toThrow(/empty/);

    const list = await commentsFor(db, draftId);
    expect(list.map((c) => [c.line, c.author, c.body])).toEqual([
      [1, "P0", "this line sings"],
    ]);
  });
});

describe("perpetual after completion", () => {
  it("participants still chat and comment once the tournament is complete", async () => {
    const { tournaments: tt } = await import("../db/schema");
    await db.update(tt).set({ phase: "complete" }).where(eq(tt.id, tournamentId));
    const g = await globalRoom(db, tournamentId);
    await postMessage(db, g!.id, p0Id, "post-tournament reflection");
    await addComment(db, { textVersionId: draftId, authorId: p0Id, line: 2, body: "for posterity" });
  });
});
