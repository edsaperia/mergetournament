"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "../../db";
import { DomainError } from "../../lib/errors";
import {
  addParticipant,
  reissueLink,
  removeParticipant,
  updateParticipant,
} from "../../services/tournament-service";
import { baseUrl, getEmailer } from "../config";
import { requireAdmin } from "../session";
import { fail, lastDevLink, withAdmin, type ActionState } from "./shared";

export interface BulkInviteResult {
  ok: boolean;
  message: string;
  /** Per-entry outcome, same order as submitted; null means invited. */
  errors: (string | null)[];
}

/** Invite many participants; failures are per-entry, successes stick. */
export async function bulkInviteAction(
  slug: string,
  entries: { name: string; email: string }[]
): Promise<BulkInviteResult> {
  try {
    const admin = await requireAdmin(slug);
    const db = await getDb();
    if (entries.length > 200) throw new DomainError("at most 200 invites at a time");
    const errors: (string | null)[] = [];
    for (const entry of entries) {
      try {
        await addParticipant(db, getEmailer(), baseUrl(), admin.tournamentId, entry);
        errors.push(null);
      } catch (e) {
        unstable_rethrow(e);
        if (e instanceof DomainError) errors.push(e.message);
        else {
          console.error("[action]", e);
          errors.push("something went wrong");
        }
      }
    }
    revalidatePath(`/${slug}/admin`);
    const invited = errors.filter((e) => e === null).length;
    const failed = errors.length - invited;
    return {
      ok: failed === 0,
      message: failed === 0 ? `Invited ${invited}.` : `Invited ${invited} · ${failed} failed:`,
      errors,
    };
  } catch (e) {
    const f = fail(e);
    return { ok: false, message: f.message, errors: entries.map(() => f.message) };
  }
}

export async function reissueLinkAction(slug: string, participantId: string): Promise<ActionState> {
  return withAdmin(slug, { revalidate: [`/${slug}/admin`], notify: false }, async (db, admin) => {
    await reissueLink(db, getEmailer(), baseUrl(), admin.tournamentId, participantId);
    return { message: "New link emailed.", devLink: lastDevLink() };
  });
}

export async function updateParticipantAction(
  slug: string,
  participantId: string,
  patch: { name?: string; email?: string }
): Promise<ActionState> {
  return withAdmin(slug, { revalidate: [`/${slug}/admin`] }, async (db, admin) => {
    const { participant, emailChanged } = await updateParticipant(
      db,
      getEmailer(),
      baseUrl(),
      admin.tournamentId,
      participantId,
      patch
    );
    return {
      message: emailChanged ? `Updated — a fresh magic link was emailed to ${participant.email}.` : "Updated.",
      devLink: emailChanged ? lastDevLink() : undefined,
    };
  });
}

export async function removeParticipantAction(slug: string, participantId: string): Promise<ActionState> {
  return withAdmin(slug, { revalidate: [`/${slug}/admin`], notify: false }, async (db, admin) => {
    await removeParticipant(db, admin.tournamentId, participantId);
    return { message: "Participant removed." };
  });
}
