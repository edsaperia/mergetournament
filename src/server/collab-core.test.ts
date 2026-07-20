import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

  handle = createCollabServer({ port: 0, secret: SECRET, getDb: async () => db as unknown as Db, debounce: 50 });
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
    await until(async () => true);
    await settle(300);
    const [row] = await db.select().from(merges).where(eq(merges.id, merge.id));
    expect(row.workingText).toContain("Hello from A.");
    expect(row.workingText).toContain("And B agrees.");
    // Activity marked for the backstop.
    expect(row.activeA).toBe(true);
    expect(row.activeB).toBe(true);

    a.provider.destroy();
    b.provider.destroy();
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
    // The rejected update closed the connection and unloaded the doc; the
    // persisted row must hold the frozen text, without the late edit.
    const [row] = await db.select().from(merges).where(eq(merges.id, merge.id));
    expect(row.workingText).toBe(frozen);
    expect(row.workingText).not.toContain("AFTER-FREEZE");
    a.provider.destroy();
  });
});
