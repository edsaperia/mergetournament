/**
 * Exports (SPEC §9): the canonical text, the provenance tree (with Mermaid
 * source), the original drafts as an attributed markdown bundle, and the
 * audit log as JSONL. The tournament is fully reproducible from these.
 */

import { and, asc, eq } from "drizzle-orm";
import { auditLog, merges, participants, slots, textVersions, tournaments, rounds } from "../db/schema";
import { resolutionLabel } from "../lib/resolution";
import type { Db } from "./tournament-service";

export async function canonicalText(db: Db, tournamentId: string): Promise<string | null> {
  const allRounds = await db.select().from(rounds).where(eq(rounds.tournamentId, tournamentId));
  if (allRounds.length === 0) return null;
  const [finalSlot] = await db
    .select()
    .from(slots)
    .where(and(eq(slots.tournamentId, tournamentId), eq(slots.roundNo, allRounds.length)));
  if (finalSlot?.outState !== "filled" || !finalSlot.outTextId) return null;
  const [text] = await db.select().from(textVersions).where(eq(textVersions.id, finalSlot.outTextId));
  return text?.bodyMd ?? null;
}

export interface ProvenanceNode {
  id: string;
  kind: string;
  wordCount: number;
  author: string | null;
  parentAId: string | null;
  parentBId: string | null;
  /** How the merge that created this text resolved; null for drafts. */
  resolution: string | null;
  /** The round whose merge created this text; null for drafts. */
  round: number | null;
}

/**
 * A resolved merge that created no new text: an input advanced unchanged
 * (coin flip, or one bearer taking part without accepting), or nothing
 * advanced (abandoned). Without these the tree would skip the merge.
 */
export interface ProvenanceStep {
  mergeId: string;
  round: number;
  inputAId: string;
  inputBId: string;
  resolution: string;
  /** The input that advanced unchanged, or null if the merge was abandoned. */
  advancedTextId: string | null;
}

/**
 * A text that went on from a round without a merge: a bye, or a text standing
 * over because its partner's side came up empty. The final text may be one.
 */
export interface ProvenancePass {
  round: number;
  kind: "bye" | "standOver";
  textId: string;
}

export interface Provenance {
  nodes: ProvenanceNode[];
  steps: ProvenanceStep[];
  passes: ProvenancePass[];
  /** The tournament's final text, once it has one. */
  canonicalTextId: string | null;
  /** The number of the final round, once the bracket exists. */
  finalRound: number | null;
}

export async function provenance(db: Db, tournamentId: string): Promise<Provenance> {
  const texts = await db
    .select({
      id: textVersions.id,
      kind: textVersions.kind,
      wordCount: textVersions.wordCount,
      parentAId: textVersions.parentAId,
      parentBId: textVersions.parentBId,
      author: participants.name,
    })
    .from(textVersions)
    .leftJoin(participants, eq(textVersions.authorId, participants.id))
    .where(eq(textVersions.tournamentId, tournamentId))
    .orderBy(asc(textVersions.createdAt));
  const resolved = await db
    .select({
      id: merges.id,
      round: slots.roundNo,
      textAId: merges.textAId,
      textBId: merges.textBId,
      resultTextId: merges.resultTextId,
      resolution: merges.resolution,
    })
    .from(merges)
    .innerJoin(slots, eq(merges.slotId, slots.id))
    .where(and(eq(slots.tournamentId, tournamentId), eq(merges.state, "resolved")))
    .orderBy(asc(slots.roundNo), asc(slots.position));

  // A text's creator is the merge that wrote it: a new text whose parents are
  // that merge's inputs. A later merge that advances the same text unchanged
  // shares its result id, so keying by result id alone would relabel it.
  const created = new Map<string, { resolution: string | null; round: number }>();
  const steps: ProvenanceStep[] = [];
  for (const m of resolved) {
    if (!m.textAId || !m.textBId) continue;
    const unchanged = m.resultTextId === null || m.resultTextId === m.textAId || m.resultTextId === m.textBId;
    if (unchanged) {
      steps.push({
        mergeId: m.id,
        round: m.round,
        inputAId: m.textAId,
        inputBId: m.textBId,
        resolution: m.resolution ?? "abandoned",
        advancedTextId: m.resultTextId,
      });
    } else {
      created.set(m.resultTextId!, { resolution: m.resolution, round: m.round });
    }
  }
  // Slots with a text but no merge: byes and stand-overs. A bye slot whose
  // text went into an extra pairing instead is empty, and not listed.
  const withMerge = await db
    .select({ slotId: merges.slotId })
    .from(merges)
    .innerJoin(slots, eq(merges.slotId, slots.id))
    .where(eq(slots.tournamentId, tournamentId));
  const mergeSlots = new Set(withMerge.map((r) => r.slotId));
  const passes: ProvenancePass[] = (
    await db
      .select()
      .from(slots)
      .where(and(eq(slots.tournamentId, tournamentId), eq(slots.outState, "filled")))
      .orderBy(asc(slots.roundNo), asc(slots.position))
  )
    .filter((sl) => !mergeSlots.has(sl.id) && sl.outTextId)
    .map((sl) => ({ round: sl.roundNo, kind: sl.kind === "bye" ? "bye" : "standOver", textId: sl.outTextId! }));

  const { canonicalTextId, finalRound } = await finalOf(db, tournamentId);
  return {
    nodes: texts.map((t) => ({
      ...t,
      author: t.author ?? null,
      resolution: created.get(t.id)?.resolution ?? null,
      round: created.get(t.id)?.round ?? null,
    })),
    steps,
    passes,
    canonicalTextId,
    finalRound,
  };
}

async function finalOf(db: Db, tournamentId: string) {
  const allRounds = await db.select().from(rounds).where(eq(rounds.tournamentId, tournamentId));
  if (allRounds.length === 0) return { canonicalTextId: null, finalRound: null };
  const [finalSlot] = await db
    .select()
    .from(slots)
    .where(and(eq(slots.tournamentId, tournamentId), eq(slots.roundNo, allRounds.length)));
  return {
    canonicalTextId: finalSlot?.outState === "filled" ? finalSlot.outTextId : null,
    finalRound: allRounds.length,
  };
}

/** Short stable node ids for the diagram. */
function nodeRef(id: string, index: Map<string, string>): string {
  if (!index.has(id)) index.set(id, `T${index.size}`);
  return index.get(id)!;
}

const clean = (s: string) => s.replace(/[\[\]"|]/g, "");

function textLabel(n: ProvenanceNode): string {
  return n.kind === "draft"
    ? `${clean(n.author ?? "unknown")}'s draft (${n.wordCount}w)`
    : `round ${n.round ?? "?"} merge (${n.wordCount}w${n.resolution ? `, ${resolutionLabel(n.resolution)}` : ""})`;
}

function stepLabel(s: ProvenanceStep, index: Map<string, string>, finalRound: number | null): string {
  const how = resolutionLabel(s.resolution);
  const what = `round ${s.round} merge${s.round === finalRound ? " (the final)" : ""}: ${how}`;
  const goes = s.round === finalRound ? "becomes the final text" : "goes into the next round";
  return s.advancedTextId ? `${what}; ${index.get(s.advancedTextId) ?? "?"} ${goes} unchanged` : what;
}

function passLabel(p: ProvenancePass, index: Map<string, string>, finalRound: number | null): string {
  const ref = index.get(p.textId) ?? "?";
  if (p.round === finalRound) return `the final: ${ref} has no partner, so it becomes the final text`;
  return p.kind === "bye"
    ? `round ${p.round}: bye; ${ref} goes into round ${p.round + 1} unchanged`
    : `round ${p.round}: ${ref} has no partner, so it stands over into round ${p.round + 1}`;
}

export function provenanceMermaid({ nodes, steps, passes, canonicalTextId, finalRound }: Provenance): string {
  const index = new Map<string, string>();
  const lines = ["flowchart TD"];
  for (const n of nodes) {
    const ref = nodeRef(n.id, index);
    lines.push(`  ${ref}["${textLabel(n)}${n.id === canonicalTextId ? " · final text" : ""}"]`);
  }
  steps.forEach((s, i) => lines.push(`  M${i}{{"${stepLabel(s, index, finalRound)}"}}`));
  passes.forEach((p, i) => lines.push(`  S${i}(["${passLabel(p, index, finalRound)}"])`));
  for (const n of nodes) {
    const ref = index.get(n.id)!;
    if (n.parentAId && index.has(n.parentAId)) lines.push(`  ${index.get(n.parentAId)} --> ${ref}`);
    if (n.parentBId && index.has(n.parentBId)) lines.push(`  ${index.get(n.parentBId)} --> ${ref}`);
  }
  steps.forEach((s, i) => {
    if (index.has(s.inputAId)) lines.push(`  ${index.get(s.inputAId)} --> M${i}`);
    if (index.has(s.inputBId)) lines.push(`  ${index.get(s.inputBId)} --> M${i}`);
  });
  passes.forEach((p, i) => {
    if (index.has(p.textId)) lines.push(`  ${index.get(p.textId)} --> S${i}`);
  });
  return lines.join("\n");
}

export async function provenanceMarkdown(db: Db, tournamentId: string): Promise<string> {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  const tree = await provenance(db, tournamentId);
  const index = new Map<string, string>();
  tree.nodes.forEach((n) => nodeRef(n.id, index));
  const listing = tree.nodes
    .map((n) => {
      const ref = index.get(n.id)!;
      const what = n.kind === "draft" ? `draft by ${n.author ?? "unknown"}` : `round ${n.round ?? "?"} merge result`;
      const parents =
        n.parentAId && n.parentBId
          ? ` ← ${index.get(n.parentAId) ?? "?"} + ${index.get(n.parentBId) ?? "?"}`
          : "";
      const how = n.resolution ? ` (${resolutionLabel(n.resolution)})` : "";
      const final = n.id === tree.canonicalTextId ? " — **the final text**" : "";
      return `- **${ref}** — ${what}, ${n.wordCount} words${parents}${how}${final} — id \`${n.id}\``;
    })
    .join("\n");
  const stepLine = (s: ProvenanceStep) =>
    `- **M${tree.steps.indexOf(s)}** — round ${s.round} merge of ${index.get(s.inputAId) ?? "?"} + ${index.get(s.inputBId) ?? "?"}: ` +
    resolutionLabel(s.resolution) +
    (s.advancedTextId
      ? `; ${index.get(s.advancedTextId) ?? "?"} ${s.round === tree.finalRound ? "becomes the final text" : "goes into the next round"} unchanged`
      : `; nothing from it ${s.round === tree.finalRound ? "becomes the final text" : "goes into the next round"}`) +
    (s.round === tree.finalRound ? " — the final" : "") +
    ` — merge id \`${s.mergeId}\``;
  const kept = tree.steps.filter((s) => s.advancedTextId !== null).map(stepLine);
  const abandoned = tree.steps.filter((s) => s.advancedTextId === null).map(stepLine);
  const passed = tree.passes.map((p, i) => `- **S${i}** — ${passLabel(p, index, tree.finalRound)} — text id \`${p.textId}\``);
  const section = (title: string, items: string[]) => (items.length > 0 ? [`## ${title}`, "", items.join("\n"), ""] : []);
  return [
    `# Provenance — ${t?.name ?? tournamentId}`,
    "",
    "Every text version with its parentage; every merge that kept an input unchanged or was abandoned; and every text that went on without a merge (a bye, or standing over with no partner). The final text traces back through all of them to the original drafts.",
    "",
    "```mermaid",
    provenanceMermaid(tree),
    "```",
    "",
    "## Versions",
    "",
    listing,
    "",
    ...section("Merges that kept an input unchanged", kept),
    ...section("Abandoned merges", abandoned),
    ...section("Texts that went on without a merge", passed),
  ].join("\n");
}

export async function draftsBundle(db: Db, tournamentId: string): Promise<string> {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  const drafts = await db
    .select({ body: textVersions.bodyMd, wordCount: textVersions.wordCount, author: participants.name })
    .from(textVersions)
    .leftJoin(participants, eq(textVersions.authorId, participants.id))
    .where(and(eq(textVersions.tournamentId, tournamentId), eq(textVersions.kind, "draft")))
    .orderBy(asc(textVersions.createdAt));
  const parts = drafts.map(
    (d) => `## Draft by ${d.author ?? "unknown"} (${d.wordCount} words)\n\n${d.body}`
  );
  return [`# Original drafts — ${t?.name ?? tournamentId}`, "", ...parts, ""].join("\n\n");
}

export async function auditJsonl(db: Db, tournamentId: string): Promise<string> {
  const entries = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.tournamentId, tournamentId))
    .orderBy(asc(auditLog.id));
  return entries
    .map((e) =>
      JSON.stringify({ id: e.id, action: e.action, payload: e.payload, at: e.createdAt.toISOString() })
    )
    .join("\n");
}
