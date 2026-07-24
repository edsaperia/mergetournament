"use server";

import {
  beginTournament,
  mergeAction,
  pauseTournament,
  publishBracket,
  unpauseTournament,
  type WorkspaceAction,
} from "../../services/runtime-service";
import { baseUrl, getEmailer } from "../config";
import { withAdmin, withParticipant, type ActionState } from "./shared";

export async function publishBracketAction(slug: string): Promise<ActionState> {
  return withAdmin(slug, { revalidate: [`/${slug}`, `/${slug}/admin`] }, async (db, admin) => {
    const { n, numRounds } = await publishBracket(db, getEmailer(), baseUrl(), admin.tournamentId);
    return { message: `Tournament started: ${n} drafts, ${numRounds} rounds. Now convening.` };
  });
}

export async function beginAction(slug: string): Promise<ActionState> {
  return withAdmin(slug, { revalidate: [`/${slug}`] }, async (db, admin) => {
    await beginTournament(db, admin.tournamentId, new Date());
    return { message: "Round 1 is open." };
  });
}

export async function pauseAction(slug: string, resume: boolean): Promise<ActionState> {
  return withAdmin(slug, { revalidate: [`/${slug}`] }, async (db, admin) => {
    if (resume) await unpauseTournament(db, admin.tournamentId, new Date());
    else await pauseTournament(db, admin.tournamentId, new Date());
    return { message: resume ? "Resumed." : "Paused." };
  });
}

export async function workspaceAction(
  slug: string,
  mergeId: string,
  action: WorkspaceAction
): Promise<ActionState> {
  return withParticipant(slug, { revalidate: [`/${slug}/merge/${mergeId}`, `/${slug}`] }, async (db, me) => {
    const { collab, syncMergeText } = await import("../collab");
    // Lock-in must act on the live CRDT text, not the debounced snapshot.
    if (action.type === "propose" || action.type === "confirm") {
      await syncMergeText(mergeId);
    }
    await mergeAction(db, mergeId, me.id, action, new Date());
    // Freezes (propose/lock) must reach the sync server's gate immediately.
    collab()?.invalidateGate(mergeId);
  });
}
