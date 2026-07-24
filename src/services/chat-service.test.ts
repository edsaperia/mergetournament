import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, TestDb } from "../db/test-db";
import { merges } from "../db/schema";
import {
  addComment,
  commentsFor,
  globalRoom,
  messagesFor,
  postMessage,
  roomForMerge,
  roomForText,
} from "./chat-service";
import { mergeAction } from "./runtime-service";
import { makeTournament } from "./test-fixture";

let db: TestDb;
let tournamentId: string;
let adminId: string;
let p0Id: string;
let draftId: string;

beforeAll(async () => {
  ({ db } = await createTestDb());
  const { t, admin, people, drafts } = await makeTournament(db, {
    slug: "chat",
    name: "Chat",
    roundDurationS: 3600,
    draftBody: (i) => (i === 0 ? "Line zero.\nLine one.\nLine two." : "Other draft."),
    beginAt: new Date(),
  });
  tournamentId = t.id;
  adminId = admin.id;
  p0Id = people[0].id;
  draftId = drafts[0].id;
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
    const { t: pre, people } = await makeTournament(db, { slug: "chat-pre", name: "Pre", participants: 1 });
    const room = await globalRoom(db, pre.id);
    await expect(postMessage(db, room!.id, people[0].id, "too early")).rejects.toThrow(/when the tournament starts/);
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
