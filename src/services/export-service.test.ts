import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TestDb } from "../db/test-db";
import { merges } from "../db/schema";
import { ConsoleEmailer } from "../lib/email";
import { auditJsonl, canonicalText, draftsBundle, provenance, provenanceMermaid, provenanceMarkdown } from "./export-service";
import { mergeAction, tick } from "./runtime-service";
import { makeTournament } from "./test-fixture";

let db: TestDb;
let tournamentId: string;
const T0 = new Date("2026-07-18T10:00:00Z");

beforeAll(async () => {
  ({ db } = await createTestDb());
  const emailer = new ConsoleEmailer();
  const { t } = await makeTournament(db, {
    slug: "exp",
    name: "Export Test",
    names: ["Ada", "Bo"],
    emailer,
    draftBody: (_i, name) => `${name}'s draft text.`,
    beginAt: T0,
  });
  tournamentId = t.id;
  const [m] = await db.select().from(merges);
  const now = new Date(T0.getTime() + 60_000);
  await mergeAction(db, m.id, m.bearerAId!, { type: "edit", text: "The merged constitution." }, now);
  await mergeAction(db, m.id, m.bearerAId!, { type: "selectBearer", pref: "A" }, now);
  await mergeAction(db, m.id, m.bearerBId!, { type: "selectBearer", pref: "A" }, now);
  await mergeAction(db, m.id, m.bearerAId!, { type: "propose" }, now);
  await mergeAction(db, m.id, m.bearerBId!, { type: "confirm" }, now);
  await tick(db, emailer, "http://x", t.id, new Date(T0.getTime() + 61_000));
});

describe("exports", () => {
  it("exports the canonical text", async () => {
    expect(await canonicalText(db, tournamentId)).toBe("The merged constitution.");
  });

  it("builds a provenance tree whose mermaid has every version and both parent edges", async () => {
    const nodes = await provenance(db, tournamentId);
    expect(nodes).toHaveLength(3); // 2 drafts + 1 merge result
    const result = nodes.find((n) => n.kind === "merge_result")!;
    expect(result.resolution).toBe("agreed");
    expect([result.parentAId, result.parentBId].sort()).toEqual(
      nodes.filter((n) => n.kind === "draft").map((n) => n.id).sort()
    );

    const mermaid = provenanceMermaid(nodes);
    expect(mermaid).toContain("flowchart TD");
    expect(mermaid).toContain("Ada's draft");
    expect(mermaid).toContain("Bo's draft");
    expect((mermaid.match(/-->/g) ?? []).length).toBe(2);

    const md = await provenanceMarkdown(db, tournamentId);
    expect(md).toContain("```mermaid");
    expect(md).toContain("## Versions");
  });

  it("bundles the original drafts with attribution", async () => {
    const bundle = await draftsBundle(db, tournamentId);
    expect(bundle).toContain("## Draft by Ada");
    expect(bundle).toContain("## Draft by Bo");
    expect(bundle).toContain("Ada's draft text.");
  });

  it("exports the audit log as parseable JSONL including seeds", async () => {
    const jsonl = await auditJsonl(db, tournamentId);
    const entries = jsonl.split("\n").map((l) => JSON.parse(l));
    expect(entries.length).toBeGreaterThan(4);
    const published = entries.find((e) => e.action === "bracket_published");
    expect(typeof published.payload.seed).toBe("number");
    expect(published.payload.seedCommitment).toMatch(/^[0-9a-f]{64}$/);
    expect(entries.every((e) => typeof e.at === "string")).toBe(true);
  });
});
