"use server";

import { and, eq } from "drizzle-orm";
import { participants, tournaments } from "../../db/schema";
import { DomainError } from "../../lib/errors";
import { addComment, postMessage } from "../../services/chat-service";
import { saveDraft } from "../../services/tournament-service";
import { beginTournament } from "../../services/runtime-service";
import { withParticipant, type ActionState } from "./shared";

/** Autosave a participant's draft (no explicit submit — the deadline snapshots whatever is here). */
export async function saveDraftAction(slug: string, body: string): Promise<ActionState> {
  return withParticipant(slug, { revalidate: [`/${slug}/submit`] }, async (db, me) => {
    const draft = await saveDraft(db, me.id, body);
    return { message: `Saved · ${draft.wordCount} words` };
  });
}

export async function postMessageAction(slug: string, roomId: string, body: string): Promise<ActionState> {
  return withParticipant(slug, { revalidate: [[`/${slug}`, "layout"]] }, async (db, me) => {
    await postMessage(db, roomId, me.id, body);
  });
}

export async function addCommentAction(
  slug: string,
  textVersionId: string,
  line: number,
  body: string
): Promise<ActionState> {
  return withParticipant(slug, { revalidate: [`/${slug}/text/${textVersionId}`] }, async (db, me) => {
    await addComment(db, { textVersionId, authorId: me.id, line, body });
  });
}

/**
 * Convening (SPEC §4): a participant confirms readiness; when every
 * participant is ready, the tournament begins itself.
 */
export async function readyAction(slug: string): Promise<ActionState> {
  return withParticipant(slug, { revalidate: [`/${slug}`] }, async (db, me) => {
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, me.tournamentId));
    if (t.phase !== "convening") throw new DomainError("the tournament is not convening");
    await db.update(participants).set({ ready: true }).where(eq(participants.id, me.id));
    const roster = await db
      .select()
      .from(participants)
      .where(and(eq(participants.tournamentId, me.tournamentId), eq(participants.role, "participant")));
    if (roster.every((p) => p.ready)) {
      await beginTournament(db, me.tournamentId, new Date());
      return { message: "Everyone is ready — Round 1 is open." };
    }
    return { message: "You're ready." };
  });
}
