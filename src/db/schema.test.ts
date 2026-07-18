import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, TestDb } from "./test-db";
import { auditLog, participants, textVersions, tournaments } from "./schema";

let db: TestDb;

beforeAll(async () => {
  ({ db } = await createTestDb());
});

async function makeTournament(slug: string) {
  const [t] = await db
    .insert(tournaments)
    .values({ slug, name: slug, roundDurationS: 1800, breakDurationS: 600 })
    .returning();
  return t;
}

describe("constraints", () => {
  it("enforces unique slugs", async () => {
    await makeTournament("unique-slug");
    await expect(makeTournament("unique-slug")).rejects.toThrow();
  });

  it("enforces one participant per email per tournament, but allows the same email across tournaments", async () => {
    const t1 = await makeTournament("emails-1");
    const t2 = await makeTournament("emails-2");
    const row = { name: "Ada", email: "ada@example.org", tokenHash: "h1" };
    await db.insert(participants).values({ ...row, tournamentId: t1.id });
    await expect(
      db.insert(participants).values({ ...row, tournamentId: t1.id, tokenHash: "h2" })
    ).rejects.toThrow();
    await db.insert(participants).values({ ...row, tournamentId: t2.id });
  });

  it("defaults: phase setup, public visibility, zero paused time", async () => {
    const t = await makeTournament("defaults");
    expect(t.phase).toBe("setup");
    expect(t.visibility).toBe("public");
    expect(t.totalPausedS).toBe(0);
  });
});

describe("provenance tree", () => {
  it("recovers all original drafts from the final text by recursive query", async () => {
    const t = await makeTournament("provenance");
    const drafts = await db
      .insert(textVersions)
      .values(
        [0, 1, 2, 3].map((i) => ({
          tournamentId: t.id,
          kind: "draft" as const,
          bodyMd: `draft ${i}`,
          wordCount: 2,
        }))
      )
      .returning();
    const [m01] = await db
      .insert(textVersions)
      .values({
        tournamentId: t.id, kind: "merge_result", bodyMd: "m01", wordCount: 1,
        parentAId: drafts[0].id, parentBId: drafts[1].id,
      })
      .returning();
    const [m23] = await db
      .insert(textVersions)
      .values({
        tournamentId: t.id, kind: "merge_result", bodyMd: "m23", wordCount: 1,
        parentAId: drafts[2].id, parentBId: drafts[3].id,
      })
      .returning();
    const [final] = await db
      .insert(textVersions)
      .values({
        tournamentId: t.id, kind: "merge_result", bodyMd: "final", wordCount: 1,
        parentAId: m01.id, parentBId: m23.id,
      })
      .returning();

    const result = await db.execute(sql`
      WITH RECURSIVE ancestry AS (
        SELECT id, parent_a_id, parent_b_id, kind FROM text_versions WHERE id = ${final.id}
        UNION ALL
        SELECT tv.id, tv.parent_a_id, tv.parent_b_id, tv.kind
        FROM text_versions tv
        JOIN ancestry a ON tv.id = a.parent_a_id OR tv.id = a.parent_b_id
      )
      SELECT id FROM ancestry WHERE kind = 'draft' ORDER BY id
    `);
    const draftIds = result.rows.map((r) => r.id as string).sort();
    expect(draftIds).toEqual(drafts.map((d) => d.id).sort());
  });
});

describe("audit log and cascade", () => {
  it("round-trips jsonb payloads in insertion order", async () => {
    const t = await makeTournament("audit");
    await db.insert(auditLog).values({ tournamentId: t.id, action: "seeding", payload: { seed: 42, order: [2, 0, 1] } });
    await db.insert(auditLog).values({ tournamentId: t.id, action: "begin", payload: {} });
    const entries = await db.select().from(auditLog).where(eq(auditLog.tournamentId, t.id)).orderBy(auditLog.id);
    expect(entries.map((e) => e.action)).toEqual(["seeding", "begin"]);
    expect(entries[0].payload).toEqual({ seed: 42, order: [2, 0, 1] });
  });

  it("deleting a tournament cascades to its children", async () => {
    const t = await makeTournament("cascade");
    await db.insert(participants).values({ tournamentId: t.id, name: "X", email: "x@example.org", tokenHash: "h" });
    await db.insert(textVersions).values({ tournamentId: t.id, kind: "draft", bodyMd: "d", wordCount: 1 });
    await db.delete(tournaments).where(eq(tournaments.id, t.id));
    expect(await db.select().from(participants).where(eq(participants.tournamentId, t.id))).toHaveLength(0);
    expect(await db.select().from(textVersions).where(eq(textVersions.tournamentId, t.id))).toHaveLength(0);
  });
});
