import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { eq } from "drizzle-orm";
import { createTestDb, TestDb } from "../db/test-db";
import { merges } from "../db/schema";
import { signCollabToken } from "../lib/collab-token";
import { ConsoleEmailer } from "../lib/email";
import { beginTournament, publishBracket } from "../services/runtime-service";
import { addParticipant, createTournament, saveDraft, type Db } from "../services/tournament-service";
import { createCollabServer, docName, type CollabHandle } from "./collab-core";

const SECRET = "collab-test-secret";
let db: TestDb;
let handle: CollabHandle;
let wsUrl: string;
let merge: typeof merges.$inferSelect;

function connect(participantId: string, mergeId: string) {
  const document = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: wsUrl,
    name: docName(mergeId),
    token: signCollabToken({ participantId, mergeId }, SECRET),
    document,
  });
  return { provider, text: document.getText("content") };
}

async function until(cond: () => boolean, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Merges whose pages were told a bearer first wrote in them. */
const activeCalls: string[] = [];
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  ({ db } = await createTestDb());
  const emailer = new ConsoleEmailer();
  const t = await createTournament(db, { slug: "collab", name: "C", roundDurationS: 3600, breakDurationS: 60 });
  for (let i = 0; i < 2; i++) {
    const p = await addParticipant(db, emailer, "http://x", t.id, { name: `P${i}`, email: `p${i}@c.org` });
    await saveDraft(db, p.id, `Draft ${i}`);
  }
  await publishBracket(db, emailer, "http://x", t.id);
  await beginTournament(db, t.id, new Date());
  [merge] = await db.select().from(merges);
  expect(merge.state).toBe("open");

  handle = createCollabServer({
    port: 0,
    secret: SECRET,
    getDb: async () => db as unknown as Db,
    debounce: 50,
    onActive: (mergeId) => {
      activeCalls.push(mergeId);
    },
  });
  await handle.server.listen();
  wsUrl = `ws://localhost:${handle.server.address.port}`;
}, 30000);

afterAll(async () => {
  await handle?.server.destroy();
});

describe("collab write gates", () => {
  it("syncs edits between the two bearers and persists to the merge row", async () => {
    const a = connect(merge.bearerAId!, merge.id);
    const b = connect(merge.bearerBId!, merge.id);
    await until(() => a.provider.synced && b.provider.synced);

    a.text.insert(0, "Hello from A. ");
    await until(() => b.text.toString().includes("Hello from A."));
    b.text.insert(b.text.length, "And B agrees.");
    await until(() => a.text.toString().includes("And B agrees."));

    // The store hook (debounced 50ms) persists into working_text.
    await settle(300);
    const [row] = await db.select().from(merges).where(eq(merges.id, merge.id));
    expect(row.workingText).toContain("Hello from A.");
    expect(row.workingText).toContain("And B agrees.");
    // Activity marked for the backstop.
    expect(row.activeA).toBe(true);
    expect(row.activeB).toBe(true);
    // Each bearer's first edit tells open pages, once: the pick line depends on who has taken part.
    expect(activeCalls).toEqual([merge.id, merge.id]);
    // Later edits from the same bearers don't tell them again.
    a.text.insert(a.text.length, " A again.");
    b.text.insert(b.text.length, " B again.");
    await until(() => (handle.liveText(merge.id) ?? "").includes("B again."));
    await settle(300);
    expect(activeCalls).toEqual([merge.id, merge.id]);

    a.provider.destroy();
    b.provider.destroy();
  });

  it("a frozen merge's refused edit neither marks the bearer active nor refreshes pages", async () => {
    // A fresh merge, so neither bearer has been marked yet.
    const emailer = new ConsoleEmailer();
    const t = await createTournament(db, { slug: "collab-frozen", name: "F", roundDurationS: 3600, breakDurationS: 60 });
    for (let i = 0; i < 2; i++) {
      const p = await addParticipant(db, emailer, "http://x", t.id, { name: `F${i}`, email: `f${i}@f.org` });
      await saveDraft(db, p.id, `Draft ${i}`);
    }
    await publishBracket(db, emailer, "http://x", t.id);
    await beginTournament(db, t.id, new Date());
    const [fresh] = await db.select().from(merges).where(eq(merges.state, "open")).then((rows) => rows.filter((m) => m.id !== merge.id));
    await db.update(merges).set({ proposedBy: "B" }).where(eq(merges.id, fresh.id));

    const a = connect(fresh.bearerAId!, fresh.id);
    await until(() => a.provider.synced);
    a.text.insert(0, "REFUSED ");
    await settle();
    expect(handle.liveText(fresh.id) ?? "").not.toContain("REFUSED");
    expect(activeCalls).not.toContain(fresh.id);
    const [row] = await db.select().from(merges).where(eq(merges.id, fresh.id));
    expect(row.activeA).toBe(false);

    a.provider.destroy();

    // Unfrozen, the same bearer's next edit counts, once. (A fresh client: the
    // refused update stays in the old one's document, and later edits build on it.)
    await db.update(merges).set({ proposedBy: null }).where(eq(merges.id, fresh.id));
    handle.invalidateGate(fresh.id);
    const again = connect(fresh.bearerAId!, fresh.id);
    await until(() => again.provider.synced);
    again.text.insert(0, "ACCEPTED ");
    await until(() => (handle.liveText(fresh.id) ?? "").includes("ACCEPTED"));
    await settle(300);
    expect(activeCalls.filter((id) => id === fresh.id)).toHaveLength(1);
    again.provider.destroy();
  });

  it("rejects invalid tokens", async () => {
    const document = new Y.Doc();
    let failed = false;
    const provider = new HocuspocusProvider({
      url: wsUrl,
      name: docName(merge.id),
      token: "forged.token",
      document,
      onAuthenticationFailed: () => {
        failed = true;
      },
    });
    await until(() => failed);
    provider.destroy();
  });

  it("connects non-bearers read-only: their edits never reach the server document", async () => {
    const outsider = connect("00000000-0000-0000-0000-000000000000", merge.id);
    await until(() => outsider.provider.synced);
    const before = handle.liveText(merge.id) ?? "";
    outsider.text.insert(0, "OUTSIDER WAS HERE ");
    await settle();
    expect(handle.liveText(merge.id) ?? "").toBe(before);
    expect(handle.liveText(merge.id)).not.toContain("OUTSIDER");
    outsider.provider.destroy();
  });

  it("freezes writes once a lock-in is proposed, even from a connected bearer", async () => {
    const a = connect(merge.bearerAId!, merge.id);
    await until(() => a.provider.synced);
    a.text.insert(0, "before-freeze ");
    await until(() => (handle.liveText(merge.id) ?? "").includes("before-freeze"));

    // Bearer B proposes lock-in: the pen freezes server-side.
    await db.update(merges).set({ proposedBy: "B" }).where(eq(merges.id, merge.id));
    handle.invalidateGate(merge.id);
    await settle(100);

    const frozen = handle.liveText(merge.id) ?? "";
    a.text.insert(0, "AFTER-FREEZE ");
    await settle();
    // The refused update never reached the document; the persisted row
    // must hold the frozen text, without the late edit.
    const [row] = await db.select().from(merges).where(eq(merges.id, merge.id));
    expect(row.workingText).toBe(frozen);
    expect(row.workingText).not.toContain("AFTER-FREEZE");
    a.provider.destroy();
  });

  it("a frozen merge still refuses document updates, quietly: no stack traces, presence keeps flowing", async () => {
    await db.update(merges).set({ proposedBy: null }).where(eq(merges.id, merge.id));
    handle.invalidateGate(merge.id);
    const a = connect(merge.bearerAId!, merge.id);
    const b = connect(merge.bearerBId!, merge.id);
    await until(() => a.provider.synced && b.provider.synced);

    // Freeze, as the round-countdown expiring or a lock-in proposal does.
    await db.update(merges).set({ proposedBy: "A" }).where(eq(merges.id, merge.id));
    handle.invalidateGate(merge.id);
    const frozen = handle.liveText(merge.id) ?? "";

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      a.text.insert(0, "LATE-EDIT ");
      a.provider.setAwarenessField("cursor", { at: 3 });
      await settle();
      // The document update is refused: the server's text and B's copy are unchanged.
      expect(handle.liveText(merge.id)).toBe(frozen);
      expect(b.text.toString()).not.toContain("LATE-EDIT");
      // Awareness (cursors, presence) still reaches the partner, and nothing was logged.
      await until(() =>
        [...b.provider.awareness!.getStates().values()].some((st) => (st as { cursor?: { at: number } }).cursor?.at === 3)
      );
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
    const [row] = await db.select().from(merges).where(eq(merges.id, merge.id));
    expect(row.workingText).not.toContain("LATE-EDIT");

    // Unfrozen again (keep editing), the same connection writes again.
    await db.update(merges).set({ proposedBy: null }).where(eq(merges.id, merge.id));
    handle.invalidateGate(merge.id);
    b.text.insert(0, "AFTER-UNFREEZE ");
    await until(() => (handle.liveText(merge.id) ?? "").includes("AFTER-UNFREEZE"));

    a.provider.destroy();
    b.provider.destroy();
  });
});
