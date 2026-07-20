/**
 * Exports (SPEC §9): the canonical text, the provenance tree (with Mermaid
 * source), the original drafts as an attributed markdown bundle, and the
 * audit log as JSONL. The tournament is fully reproducible from these.
 */

import { and, asc, eq } from "drizzle-orm";
import { auditLog, merges, participants, slots, textVersions, tournaments, rounds } from "../db/schema";
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
  resolution: string | null;
}

export async function provenance(db: Db, tournamentId: string): Promise<ProvenanceNode[]> {
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
  const producers = await db
    .select({ resultTextId: merges.resultTextId, resolution: merges.resolution })
    .from(merges)
    .innerJoin(slots, eq(merges.slotId, slots.id))
    .where(eq(slots.tournamentId, tournamentId));
  const resolutionOf = new Map(producers.filter((p) => p.resultTextId).map((p) => [p.resultTextId!, p.resolution]));
  return texts.map((t) => ({ ...t, author: t.author ?? null, resolution: resolutionOf.get(t.id) ?? null }));
}

/** Short stable node ids for the diagram. */
function nodeRef(id: string, index: Map<string, string>): string {
  if (!index.has(id)) index.set(id, `T${index.size}`);
  return index.get(id)!;
}

export function provenanceMermaid(nodes: ProvenanceNode[]): string {
  const index = new Map<string, string>();
  const lines = ["flowchart TD"];
  for (const n of nodes) {
    const ref = nodeRef(n.id, index);
    const label =
      n.kind === "draft"
        ? `${(n.author ?? "unknown").replace(/[\[\]"|]/g, "")}'s draft (${n.wordCount}w)`
        : `merge result (${n.wordCount}w${n.resolution ? `, ${n.resolution}` : ""})`;
    lines.push(`  ${ref}["${label}"]`);
  }
  for (const n of nodes) {
    const ref = index.get(n.id)!;
    if (n.parentAId && index.has(n.parentAId)) lines.push(`  ${index.get(n.parentAId)} --> ${ref}`);
    if (n.parentBId && index.has(n.parentBId)) lines.push(`  ${index.get(n.parentBId)} --> ${ref}`);
  }
  return lines.join("\n");
}

export async function provenanceMarkdown(db: Db, tournamentId: string): Promise<string> {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  const nodes = await provenance(db, tournamentId);
  const index = new Map<string, string>();
  nodes.forEach((n) => nodeRef(n.id, index));
  const listing = nodes
    .map((n) => {
      const ref = index.get(n.id)!;
      const parents =
        n.parentAId && n.parentBId
          ? ` ← ${index.get(n.parentAId) ?? "?"} + ${index.get(n.parentBId) ?? "?"}`
          : "";
      const who = n.kind === "draft" ? ` by ${n.author ?? "unknown"}` : "";
      const how = n.resolution ? ` (${n.resolution})` : "";
      return `- **${ref}** — ${n.kind}${who}, ${n.wordCount} words${parents}${how} — id \`${n.id}\``;
    })
    .join("\n");
  return [
    `# Provenance — ${t?.name ?? tournamentId}`,
    "",
    "Every text version with its parentage. The final text traces back through every merge to the original drafts.",
    "",
    "```mermaid",
    provenanceMermaid(nodes),
    "```",
    "",
    "## Versions",
    "",
    listing,
    "",
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
