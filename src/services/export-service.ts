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

export interface Provenance {
  nodes: ProvenanceNode[];
  steps: ProvenanceStep[];
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
  const { canonicalTextId, finalRound } = await finalOf(db, tournamentId);
  return {
    nodes: texts.map((t) => ({
      ...t,
      author: t.author ?? null,
      resolution: created.get(t.id)?.resolution ?? null,
      round: created.get(t.id)?.round ?? null,
    })),
    steps,
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

export function provenanceMermaid({ nodes, steps, canonicalTextId, finalRound }: Provenance): string {
  const index = new Map<string, string>();
  const lines = ["flowchart TD"];
  for (const n of nodes) {
    const ref = nodeRef(n.id, index);
    lines.push(`  ${ref}["${textLabel(n)}${n.id === canonicalTextId ? " · final text" : ""}"]`);
  }
  steps.forEach((s, i) => lines.push(`  M${i}{{"${stepLabel(s, index, finalRound)}"}}`));
  for (const n of nodes) {
    const ref = index.get(n.id)!;
    if (n.parentAId && index.has(n.parentAId)) lines.push(`  ${index.get(n.parentAId)} --> ${ref}`);
    if (n.parentBId && index.has(n.parentBId)) lines.push(`  ${index.get(n.parentBId)} --> ${ref}`);
  }
  steps.forEach((s, i) => {
    if (index.has(s.inputAId)) lines.push(`  ${index.get(s.inputAId)} --> M${i}`);
    if (index.has(s.inputBId)) lines.push(`  ${index.get(s.inputBId)} --> M${i}`);
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
  const stepListing = tree.steps
    .map(
      (s, i) =>
        `- **M${i}** — round ${s.round} merge of ${index.get(s.inputAId) ?? "?"} + ${index.get(s.inputBId) ?? "?"}: ` +
        (s.advancedTextId
          ? `${resolutionLabel(s.resolution)}; ${index.get(s.advancedTextId) ?? "?"} ${s.round === tree.finalRound ? "becomes the final text" : "goes into the next round"} unchanged`
          : resolutionLabel(s.resolution)) +
        (s.round === tree.finalRound ? " — the final" : "") +
        ` — merge id \`${s.mergeId}\``
    )
    .join("\n");
  return [
    `# Provenance — ${t?.name ?? tournamentId}`,
    "",
    "Every text version with its parentage, and every merge that kept an input unchanged. The final text traces back through every merge to the original drafts.",
    "",
    "```mermaid",
    provenanceMermaid(tree),
    "```",
    "",
    "## Versions",
    "",
    listing,
    "",
    ...(stepListing ? ["## Merges that kept an input unchanged", "", stepListing, ""] : []),
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
