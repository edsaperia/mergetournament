import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, TestDb } from "../db/test-db";
import { emailEvents, tournaments } from "../db/schema";
import { ConsoleEmailer } from "../lib/email";
import { verifySvixSignature } from "../lib/svix";
import { warnThresholds } from "../lib/schedule";
import { deleteOwnTournament, deleteTournament, latestEmailEvents, overview } from "./sysadmin-service";
import { publishBracket } from "./runtime-service";
import { addParticipant, createTournament, saveDraft } from "./tournament-service";
import { createHmac } from "node:crypto";

let db: TestDb;
const emailer = new ConsoleEmailer();

beforeAll(async () => {
  ({ db } = await createTestDb());
});

async function make(slug: string, participantCount: number, drafts: number) {
  const t = await createTournament(db, { slug, name: `T ${slug}`, roundDurationS: 600, breakDurationS: 60 });
  const admin = await addParticipant(db, emailer, "http://x", t.id, {
    name: "Admin",
    email: `admin@${slug}.org`,
    role: "admin",
  });
  const people = [];
  for (let i = 0; i < participantCount; i++) {
    const p = await addParticipant(db, emailer, "http://x", t.id, { name: `P${i}`, email: `p${i}@${slug}.org` });
    if (i < drafts) await saveDraft(db, p.id, `Draft ${i}`);
    people.push(p);
  }
  return { t, admin, people };
}

describe("sysadmin overview", () => {
  it("reports slug, status, creator email, and counts per tournament", async () => {
    await make("ov-a", 3, 2);
    const { t: b } = await make("ov-b", 2, 2);
    await publishBracket(db, emailer, "http://x", b.id, 1);

    const rows = await overview(db);
    const a = rows.find((r) => r.slug === "ov-a")!;
    expect(a.status).toBe("awaiting drafts");
    expect(a.creatorEmail).toBe("admin@ov-a.org");
    expect(a.participantCount).toBe(4); // admin + 3
    expect(a.draftCount).toBe(2);
    expect(rows.find((r) => r.slug === "ov-b")!.status).toBe("convening");
  });
});

describe("deletion rules", () => {
  it("sysadmin deletes anything; admins only their own, pre-publication", async () => {
    const { t, admin } = await make("del-a", 1, 1);
    await deleteOwnTournament(db, admin.id);
    expect(await db.select().from(tournaments).where(eq(tournaments.id, t.id))).toHaveLength(0);

    const { t: pub, admin: pubAdmin, people } = await make("del-b", 2, 2);
    await publishBracket(db, emailer, "http://x", pub.id, 1);
    await expect(deleteOwnTournament(db, pubAdmin.id)).rejects.toThrow(/published/);
    await expect(deleteOwnTournament(db, people[0].id)).rejects.toThrow(/admin/);
    await deleteTournament(db, pub.id);
    expect(await db.select().from(tournaments).where(eq(tournaments.id, pub.id))).toHaveLength(0);
  });
});

describe("email delivery events", () => {
  it("returns the latest event per address", async () => {
    await db.insert(emailEvents).values({ email: "x@y.org", event: "email.sent" });
    await db.insert(emailEvents).values({ email: "x@y.org", event: "email.delivered" });
    await db.insert(emailEvents).values({ email: "z@y.org", event: "email.bounced" });
    const latest = await latestEmailEvents(db, ["x@y.org", "z@y.org", "none@y.org"]);
    expect(latest.get("x@y.org")?.event).toBe("email.delivered");
    expect(latest.get("z@y.org")?.event).toBe("email.bounced");
    expect(latest.has("none@y.org")).toBe(false);
  });
});

describe("svix signature verification", () => {
  const secretBytes = Buffer.from("super-secret-webhook-key");
  const secret = `whsec_${secretBytes.toString("base64")}`;
  const sign = (id: string, ts: string, payload: string) =>
    createHmac("sha256", secretBytes).update(`${id}.${ts}.${payload}`).digest("base64");

  it("accepts a valid signature and rejects tampering, wrong keys, and stale timestamps", () => {
    const now = 1_800_000_000_000;
    const ts = String(now / 1000);
    const payload = JSON.stringify({ type: "email.delivered", data: { to: ["a@b.c"] } });
    const good = `v1,${sign("msg_1", ts, payload)}`;

    const base = { secret, id: "msg_1", timestamp: ts, payload, nowMs: now };
    expect(verifySvixSignature({ ...base, signatureHeader: good })).toBe(true);
    expect(verifySvixSignature({ ...base, signatureHeader: `v1,${sign("msg_2", ts, payload)}` })).toBe(false);
    expect(verifySvixSignature({ ...base, payload: payload + "x", signatureHeader: good })).toBe(false);
    expect(
      verifySvixSignature({ ...base, secret: "whsec_" + Buffer.from("other").toString("base64"), signatureHeader: good })
    ).toBe(false);
    expect(verifySvixSignature({ ...base, nowMs: now + 3600_000, signatureHeader: good })).toBe(false);
    // Multiple space-separated signatures: any valid v1 passes.
    expect(verifySvixSignature({ ...base, signatureHeader: `v1,AAAA ${good}` })).toBe(true);
  });
});

describe("warn thresholds", () => {
  it("scales for rapid tournaments", () => {
    expect(warnThresholds(1800)).toEqual({ warnAtS: 300, dangerAtS: 60 });
    expect(warnThresholds(180)).toEqual({ warnAtS: 36, dangerAtS: 9 });
    expect(warnThresholds(60)).toEqual({ warnAtS: 12, dangerAtS: 3 });
  });
});
