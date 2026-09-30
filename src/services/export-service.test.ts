import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, TestDb } from "../db/test-db";
import { and, asc, eq } from "drizzle-orm";
import { merges, slots } from "../db/schema";
import { ConsoleEmailer } from "../lib/email";
import { roomForMerge, roomForText } from "./chat-service";
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
    const tree = await provenance(db, tournamentId);
    const { nodes } = tree;
    expect(nodes).toHaveLength(3); // 2 drafts + 1 merge result
    const result = nodes.find((n) => n.kind === "merge_result")!;
    expect(result.resolution).toBe("agreed");
    expect([result.parentAId, result.parentBId].sort()).toEqual(
      nodes.filter((n) => n.kind === "draft").map((n) => n.id).sort()
    );

    expect(tree.steps).toEqual([]);
    expect(tree.canonicalTextId).toBe(result.id);

    const mermaid = provenanceMermaid(tree);
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

describe("provenance when the final advances an input unchanged", () => {
  // The 30 Sep playtest: round 1 agreed, the final ran out and a coin flip
  // advanced one of the round-1 texts intact.
  let tid: string;
  let round1Results: string[];
  let finalMergeId: string;

  beforeAll(async () => {
    const emailer = new ConsoleEmailer();
    const { t } = await makeTournament(db, {
      slug: "exp-flip",
      names: ["Ada", "Ben", "Cleo", "Dev"],
      participants: 4,
      emailer,
      beginAt: T0,
    });
    tid = t.id;
    const at = (s: number) => new Date(T0.getTime() + s * 1000);
    const mergesOf = async (roundNo: number) => {
      const rs = await db
        .select()
        .from(slots)
        .where(and(eq(slots.tournamentId, tid), eq(slots.roundNo, roundNo)))
        .orderBy(asc(slots.position));
      return (await db.select().from(merges)).filter((m) => rs.some((s) => s.id === m.slotId));
    };
    for (const [i, m] of (await mergesOf(1)).entries()) {
      await mergeAction(db, m.id, m.bearerAId!, { type: "edit", text: `Round-1 text ${i}.` }, at(60));
      await mergeAction(db, m.id, m.bearerAId!, { type: "selectBearer", pref: "A" }, at(60));
      await mergeAction(db, m.id, m.bearerAId!, { type: "propose" }, at(60));
      await mergeAction(db, m.id, m.bearerBId!, { type: "confirm" }, at(60));
    }
    await tick(db, emailer, "http://x", tid, at(61)); // round 1 closes early
    round1Results = (await mergesOf(1)).map((m) => m.resultTextId!);
    await tick(db, emailer, "http://x", tid, at(660)); // the final opens on schedule
    const [final] = await mergesOf(2);
    finalMergeId = final.id;
    // Both bearers take part, neither proposes: the window ends in a coin flip.
    await mergeAction(db, final.id, final.bearerAId!, { type: "edit", text: "A merge nobody accepted." }, at(700));
    await mergeAction(db, final.id, final.bearerBId!, { type: "selectBearer", pref: "B" }, at(701));
    await tick(db, emailer, "http://x", tid, at(1260)); // round-countdown expires
    await tick(db, emailer, "http://x", tid, at(1320)); // decision-window ends
    const [resolved] = await db.select().from(merges).where(eq(merges.id, final.id));
    expect(resolved.resolution).toBe("backstop_flip");
  });

  it("keeps each text's own resolution: the round-1 text stays agreed", async () => {
    const tree = await provenance(db, tid);
    const created = tree.nodes.filter((n) => n.kind === "merge_result");
    expect(created).toHaveLength(2);
    for (const n of created) {
      expect(n.resolution).toBe("agreed");
      expect(n.round).toBe(1);
    }
    expect(round1Results).toContain(tree.canonicalTextId);
  });

  it("lists the final as a merge whose result is an unchanged input", async () => {
    const tree = await provenance(db, tid);
    expect(tree.finalRound).toBe(2);
    expect(tree.steps).toEqual([
      {
        mergeId: finalMergeId,
        round: 2,
        inputAId: expect.any(String),
        inputBId: expect.any(String),
        resolution: "backstop_flip",
        advancedTextId: tree.canonicalTextId,
      },
    ]);
    expect([tree.steps[0].inputAId, tree.steps[0].inputBId].sort()).toEqual([...round1Results].sort());

    const mermaid = provenanceMermaid(tree);
    expect(mermaid).toContain('M0{{"round 2 merge (the final): no agreement · coin flip between the inputs;');
    expect((mermaid.match(/--> M0$/gm) ?? []).length).toBe(2);
    expect(mermaid).not.toMatch(/backstop|active_advance|bearer_flip/);

    const md = await provenanceMarkdown(db, tid);
    expect(md).toContain("## Merges that kept an input unchanged");
    expect(md).toMatch(/becomes the final text unchanged — the final/);
    expect(md).not.toMatch(/advanc|next round/i);
    expect(md).toContain("**the final text**");
    expect(md).not.toMatch(/backstop|active_advance|bearer_flip/);
  });

  it("keeps the final text's chat on the merge that wrote it", async () => {
    const tree = await provenance(db, tid);
    const creator = (await db.select().from(merges)).find(
      (m) => m.resultTextId === tree.canonicalTextId && m.id !== finalMergeId
    )!;
    expect((await roomForText(db, tree.canonicalTextId!))?.id).toBe((await roomForMerge(db, creator.id))?.id);
  });
});

describe("provenance of a 5-draft run: a bye, an abandoned merge, an extra pairing and a final that stands over", () => {
  it("lists the abandoned merge apart from unchanged inputs, and records the bye and the stand-over", async () => {
    const T = new Date("2026-07-19T10:00:00Z");
    const at = (s: number) => new Date(T.getTime() + s * 1000);
    const emailer = new ConsoleEmailer();
    const { t } = await makeTournament(db, {
      slug: "exp5",
      names: ["Ada", "Bo", "Cleo", "Dev", "Eve"],
      participants: 5,
      breakDurationS: 300,
      emailer,
      beginAt: T,
    });
    const roundMerges = async (roundNo: number) => {
      const rs = await db
        .select()
        .from(slots)
        .where(and(eq(slots.tournamentId, t.id), eq(slots.roundNo, roundNo)))
        .orderBy(asc(slots.position));
      const out = [];
      for (const s of rs) out.push(...(await db.select().from(merges).where(eq(merges.slotId, s.id))));
      return out;
    };
    const agree = async (m: { id: string; bearerAId: string | null; bearerBId: string | null }, text: string, now: Date) => {
      await mergeAction(db, m.id, m.bearerAId!, { type: "edit", text }, now);
      await mergeAction(db, m.id, m.bearerAId!, { type: "selectBearer", pref: "A" }, now);
      await mergeAction(db, m.id, m.bearerBId!, { type: "selectBearer", pref: "A" }, now);
      await mergeAction(db, m.id, m.bearerAId!, { type: "propose" }, now);
      await mergeAction(db, m.id, m.bearerBId!, { type: "confirm" }, now);
    };
    // Round 1: one pair agrees, the other never shows up; the bye's draft waits.
    const [first] = await roundMerges(1);
    await agree(first, "Round one's merge.", at(60));
    await tick(db, emailer, "http://x", t.id, at(600));
    await tick(db, emailer, "http://x", t.id, at(660));
    // Round 2: the merge result and the bye's draft have no partners, so they pair up and agree.
    await tick(db, emailer, "http://x", t.id, at(960));
    const [extra] = await roundMerges(2);
    expect(extra.isAdHoc).toBe(true);
    await agree(extra, "The final text.", at(1000));
    // The final has one text and no partner for it: it stands over and the tournament completes.
    await tick(db, emailer, "http://x", t.id, at(1010));
    await tick(db, emailer, "http://x", t.id, at(1310));
    expect(await canonicalText(db, t.id)).toBe("The final text.");

    const tree = await provenance(db, t.id);
    expect(tree.steps).toHaveLength(1);
    expect(tree.steps[0]).toMatchObject({ round: 1, resolution: "abandoned", advancedTextId: null });
    const drafts = new Map(tree.nodes.filter((n) => n.kind === "draft").map((n) => [n.id, n.author]));
    expect(tree.passes.map((p) => ({ ...p, textId: drafts.get(p.textId) ?? p.textId === tree.canonicalTextId }))).toEqual([
      { round: 1, kind: "bye", textId: expect.any(String) },
      { round: 3, kind: "standOver", textId: true },
    ]);

    const md = await provenanceMarkdown(db, t.id);
    expect(md).not.toContain("## Merges that kept an input unchanged");
    const abandonedSection = md.slice(md.indexOf("## Abandoned merges"));
    expect(abandonedSection).toMatch(/^## Abandoned merges\n\n- \*\*M0\*\* — round 1 merge of T\d \+ T\d: abandoned · neither player took part; nothing from it goes into the next round/);
    const passedSection = md.slice(md.indexOf("## Texts that went on without a merge"));
    expect(passedSection).toMatch(/- \*\*S0\*\* — round 1: bye; T\d goes into round 2 unchanged/);
    expect(passedSection).toMatch(/- \*\*S1\*\* — the final: T\d+ has no partner, so it becomes the final text/);
    // In the diagram too, each linked from its text.
    const mermaid = provenanceMermaid(tree);
    expect(mermaid).toMatch(/S0\(\["round 1: bye; T\d goes into round 2 unchanged"\]\)/);
    expect(mermaid).toMatch(/T\d+ --> S1/);
  });
});
