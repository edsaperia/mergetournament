/**
 * Instance-operator (sysadmin) queries and actions: the cross-tournament
 * overview and tournament deletion. Auth lives at the route layer — these
 * assume the caller is already authorized.
 */

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { emailEvents, merges, participants, slots, textVersions, tournaments, type Tournament } from "../db/schema";
import { DomainError } from "../lib/errors";
import type { Db } from "./tournament-service";

export type TournamentStatus = "awaiting drafts" | "convening" | "in progress" | "paused" | "complete";

export function statusOf(t: Tournament): TournamentStatus {
  switch (t.phase) {
    case "setup":
    case "submission":
      return "awaiting drafts";
    case "convening":
      return "convening";
    case "running":
      return t.pausedAt ? "paused" : "in progress";
    case "complete":
      return "complete";
  }
}

export interface OverviewRow {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  status: TournamentStatus;
  creatorEmail: string | null;
  participantCount: number;
  draftCount: number;
}

export async function overview(db: Db): Promise<OverviewRow[]> {
  const all = await db.select().from(tournaments).orderBy(desc(tournaments.createdAt));
  if (all.length === 0) return [];
  const ids = all.map((t) => t.id);

  const counts = await db
    .select({ tournamentId: participants.tournamentId, n: count() })
    .from(participants)
    .where(inArray(participants.tournamentId, ids))
    .groupBy(participants.tournamentId);
  const draftCounts = await db
    .select({ tournamentId: textVersions.tournamentId, n: count() })
    .from(textVersions)
    .where(and(inArray(textVersions.tournamentId, ids), eq(textVersions.kind, "draft")))
    .groupBy(textVersions.tournamentId);
  const admins = await db
    .select({ tournamentId: participants.tournamentId, email: participants.email })
    .from(participants)
    .where(and(inArray(participants.tournamentId, ids), eq(participants.role, "admin")))
    .orderBy(asc(participants.createdAt));

  const countBy = new Map(counts.map((c) => [c.tournamentId, Number(c.n)]));
  const draftsBy = new Map(draftCounts.map((c) => [c.tournamentId, Number(c.n)]));
  const adminBy = new Map<string, string>();
  for (const a of admins) if (!adminBy.has(a.tournamentId)) adminBy.set(a.tournamentId, a.email);

  return all.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    createdAt: t.createdAt,
    status: statusOf(t),
    creatorEmail: adminBy.get(t.id) ?? null,
    participantCount: countBy.get(t.id) ?? 0,
    draftCount: draftsBy.get(t.id) ?? 0,
  }));
}

/** Sysadmin: delete any tournament, any phase. */
export async function deleteTournament(db: Db, tournamentId: string): Promise<void> {
  // Merges hold non-cascading references to participants and texts; remove
  // them first, then the tournament cascade takes everything else.
  const slotRows = await db.select({ id: slots.id }).from(slots).where(eq(slots.tournamentId, tournamentId));
  if (slotRows.length > 0) {
    await db.delete(merges).where(inArray(merges.slotId, slotRows.map((s) => s.id)));
  }
  await db.delete(tournaments).where(eq(tournaments.id, tournamentId));
}

/**
 * Tournament admin: delete their own tournament, but only before
 * publication (SPEC: the roster and bracket are commitments from there on).
 */
export async function deleteOwnTournament(db: Db, adminParticipantId: string): Promise<void> {
  const [admin] = await db.select().from(participants).where(eq(participants.id, adminParticipantId));
  if (!admin || admin.role !== "admin") throw new DomainError("only the tournament admin may delete it");
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, admin.tournamentId));
  if (!t) throw new DomainError("tournament not found");
  if (t.phase !== "setup" && t.phase !== "submission") {
    throw new DomainError("a started tournament cannot be deleted by its admin");
  }
  await deleteTournament(db, t.id);
}

/** Latest delivery event per email address, for the roster view. */
export async function latestEmailEvents(db: Db, emails: string[]): Promise<Map<string, { event: string; at: Date }>> {
  if (emails.length === 0) return new Map();
  const rows = await db
    .select({
      email: emailEvents.email,
      event: emailEvents.event,
      at: emailEvents.createdAt,
      rn: sql<number>`row_number() over (partition by ${emailEvents.email} order by ${emailEvents.createdAt} desc, ${emailEvents.id} desc)`,
    })
    .from(emailEvents)
    .where(inArray(emailEvents.email, emails));
  const out = new Map<string, { event: string; at: Date }>();
  for (const r of rows) if (Number(r.rn) === 1) out.set(r.email, { event: r.event, at: r.at });
  return out;
}
