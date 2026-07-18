"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db";
import { ConsoleEmailer } from "../lib/email";
import {
  addParticipant,
  createTournament,
  reissueLink,
  removeParticipant,
  saveDraft,
} from "../services/tournament-service";
import { baseUrl, getEmailer } from "./config";
import { requireAdmin, requireParticipant } from "./session";

export interface ActionState {
  ok: boolean;
  message: string;
  /** Dev-only convenience: with the console emailer, surface the magic link in the UI. */
  devLink?: string;
}

function fail(e: unknown): ActionState {
  return { ok: false, message: e instanceof Error ? e.message : "something went wrong" };
}

/** With the console emailer (no email service configured), expose the last link for the UI. */
function lastDevLink(): string | undefined {
  const emailer = getEmailer();
  if (process.env.NODE_ENV === "production" || !(emailer instanceof ConsoleEmailer)) return undefined;
  const last = emailer.sent.at(-1);
  return last?.text.match(/https?:\S+/)?.[0];
}

export async function createTournamentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = await getDb();
    const slug = String(formData.get("slug") ?? "").trim();
    const tournament = await createTournament(db, {
      slug,
      name: String(formData.get("name") ?? "").trim() || slug,
      roundDurationS: Math.round(Number(formData.get("roundMinutes") ?? 30) * 60),
      breakDurationS: Math.round(Number(formData.get("breakMinutes") ?? 10) * 60),
      visibility: formData.get("visibility") === "participants_only" ? "participants_only" : "public",
      defaultSubmission: String(formData.get("defaultSubmission") ?? ""),
    });
    await addParticipant(db, getEmailer(), baseUrl(), tournament.id, {
      name: String(formData.get("adminName") ?? "").trim() || "Admin",
      email: String(formData.get("adminEmail") ?? "").trim(),
      role: "admin",
    });
    return {
      ok: true,
      message: `Created "${tournament.name}". Your admin magic link has been emailed.`,
      devLink: lastDevLink(),
    };
  } catch (e) {
    return fail(e);
  }
}

export async function saveDraftAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const participant = await requireParticipant(slug);
    const db = await getDb();
    const draft = await saveDraft(db, participant.id, String(formData.get("body") ?? ""));
    revalidatePath(`/${slug}/submit`);
    return { ok: true, message: `Saved — ${draft.wordCount} words.` };
  } catch (e) {
    return fail(e);
  }
}

export async function addParticipantAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin(slug);
    const db = await getDb();
    const p = await addParticipant(db, getEmailer(), baseUrl(), admin.tournamentId, {
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
    });
    revalidatePath(`/${slug}/admin`);
    return { ok: true, message: `Invited ${p.name} <${p.email}>.`, devLink: lastDevLink() };
  } catch (e) {
    return fail(e);
  }
}

export async function reissueLinkAction(slug: string, participantId: string): Promise<ActionState> {
  try {
    await requireAdmin(slug);
    const db = await getDb();
    await reissueLink(db, getEmailer(), baseUrl(), participantId);
    revalidatePath(`/${slug}/admin`);
    return { ok: true, message: "New link emailed.", devLink: lastDevLink() };
  } catch (e) {
    return fail(e);
  }
}

export async function removeParticipantAction(slug: string, participantId: string): Promise<ActionState> {
  try {
    await requireAdmin(slug);
    const db = await getDb();
    await removeParticipant(db, participantId);
    revalidatePath(`/${slug}/admin`);
    return { ok: true, message: "Participant removed." };
  } catch (e) {
    return fail(e);
  }
}
