import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { verifySession } from "../lib/auth";
import { participants, tournaments } from "../db/schema";
import { getDb } from "../db";
import { authSecret, sessionCookieName } from "./config";

/**
 * Data-access layer for the current visitor (per the Next 16 auth guidance:
 * checks live here and in every server action, not in layouts).
 */

export const tournamentBySlug = cache(async (slug: string) => {
  const db = await getDb();
  const [t] = await db.select().from(tournaments).where(eq(tournaments.slug, slug));
  return t ?? null;
});

/** The authenticated participant for this tournament, or null. */
export const currentParticipant = cache(async (slug: string) => {
  const tournament = await tournamentBySlug(slug);
  if (!tournament) return null;
  const cookieStore = await cookies();
  const raw = cookieStore.get(sessionCookieName(slug))?.value;
  if (!raw) return null;
  const session = verifySession(raw, authSecret());
  if (!session || session.tournamentId !== tournament.id) return null;
  const db = await getDb();
  const [participant] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, session.participantId), eq(participants.tournamentId, tournament.id)));
  return participant ?? null;
});

export async function requireParticipant(slug: string) {
  const p = await currentParticipant(slug);
  if (!p) throw new Error("not signed in");
  return p;
}

export async function requireAdmin(slug: string) {
  const p = await requireParticipant(slug);
  if (p.role !== "admin") throw new Error("admin only");
  return p;
}
