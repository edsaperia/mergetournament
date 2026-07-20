"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { participants, tournaments } from "../db/schema";
import { ConsoleEmailer } from "../lib/email";
import { addComment, postMessage } from "../services/chat-service";
import {
  addParticipant,
  createTournament,
  reissueLink,
  removeParticipant,
  saveDraft,
  updateParticipant,
  updateSettings,
  updateSubmissionDeadline,
  updateTheme,
} from "../services/tournament-service";
import type { ThemeOverrides } from "../lib/theme";

/** Convert a datetime-local value + the client's UTC offset into an instant. */
function parseLocalDatetime(value: string, tzOffsetMin: number): Date {
  const asUtc = Date.parse(`${value}:00Z`);
  if (Number.isNaN(asUtc)) throw new Error("invalid date");
  return new Date(asUtc + tzOffsetMin * 60_000);
}
import {
  beginTournament,
  mergeAction,
  pauseTournament,
  publishBracket,
  unpauseTournament,
  type WorkspaceAction,
} from "../services/runtime-service";
import { redirect } from "next/navigation";
import { deleteOwnTournament, deleteTournament } from "../services/sysadmin-service";
import { baseUrl, getEmailer } from "./config";
import { bump } from "./events";
import { requireAdmin, requireParticipant, requireSysadmin } from "./session";

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
    const deadlineRaw = String(formData.get("submissionDeadline") ?? "").trim();
    const tournament = await createTournament(db, {
      slug,
      name: String(formData.get("name") ?? "").trim() || slug,
      roundDurationS: Math.round(Number(formData.get("roundMinutes") ?? 30) * 60),
      breakDurationS: Math.round(Number(formData.get("breakMinutes") ?? 10) * 60),
      visibility: formData.get("visibility") === "participants_only" ? "participants_only" : "public",
      defaultSubmission: String(formData.get("defaultSubmission") ?? ""),
      submissionDeadline: deadlineRaw
        ? parseLocalDatetime(deadlineRaw, Number(formData.get("tzOffsetMin") ?? 0))
        : undefined,
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

/** Autosave a participant's draft (no explicit submit — the deadline snapshots whatever is here). */
export async function saveDraftAction(slug: string, body: string): Promise<ActionState> {
  try {
    const participant = await requireParticipant(slug);
    const db = await getDb();
    const draft = await saveDraft(db, participant.id, body);
    revalidatePath(`/${slug}/submit`);
    bump(participant.tournamentId);
    return { ok: true, message: `Saved · ${draft.wordCount} words` };
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
    const admin = await requireAdmin(slug);
    const db = await getDb();
    await reissueLink(db, getEmailer(), baseUrl(), admin.tournamentId, participantId);
    revalidatePath(`/${slug}/admin`);
    return { ok: true, message: "New link emailed.", devLink: lastDevLink() };
  } catch (e) {
    return fail(e);
  }
}

export async function updateParticipantAction(
  slug: string,
  participantId: string,
  patch: { name?: string; email?: string }
): Promise<ActionState> {
  try {
    const admin = await requireAdmin(slug);
    const db = await getDb();
    const { participant, emailChanged } = await updateParticipant(
      db,
      getEmailer(),
      baseUrl(),
      admin.tournamentId,
      participantId,
      patch
    );
    revalidatePath(`/${slug}/admin`);
    bump(admin.tournamentId);
    return {
      ok: true,
      message: emailChanged ? `Updated — a fresh magic link was emailed to ${participant.email}.` : "Updated.",
      devLink: emailChanged ? lastDevLink() : undefined,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function removeParticipantAction(slug: string, participantId: string): Promise<ActionState> {
  try {
    const admin = await requireAdmin(slug);
    const db = await getDb();
    await removeParticipant(db, admin.tournamentId, participantId);
    revalidatePath(`/${slug}/admin`);
    return { ok: true, message: "Participant removed." };
  } catch (e) {
    return fail(e);
  }
}

export async function postMessageAction(slug: string, roomId: string, body: string): Promise<ActionState> {
  try {
    const me = await requireParticipant(slug);
    const db = await getDb();
    await postMessage(db, roomId, me.id, body);
    revalidatePath(`/${slug}`, "layout");
    bump(me.tournamentId);
    return { ok: true, message: "" };
  } catch (e) {
    return fail(e);
  }
}

export async function addCommentAction(
  slug: string,
  textVersionId: string,
  line: number,
  body: string
): Promise<ActionState> {
  try {
    const me = await requireParticipant(slug);
    const db = await getDb();
    await addComment(db, { textVersionId, authorId: me.id, line, body });
    revalidatePath(`/${slug}/text/${textVersionId}`);
    bump(me.tournamentId);
    return { ok: true, message: "" };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Convening (SPEC §4): a participant confirms readiness; when every
 * participant is ready, the tournament begins itself.
 */
export async function readyAction(slug: string): Promise<ActionState> {
  try {
    const me = await requireParticipant(slug);
    const db = await getDb();
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, me.tournamentId));
    if (t.phase !== "convening") return { ok: false, message: "the tournament is not convening" };
    await db.update(participants).set({ ready: true }).where(eq(participants.id, me.id));
    const roster = await db
      .select()
      .from(participants)
      .where(and(eq(participants.tournamentId, me.tournamentId), eq(participants.role, "participant")));
    let message = "You're ready.";
    if (roster.every((p) => p.ready)) {
      await beginTournament(db, me.tournamentId, new Date());
      message = "Everyone is ready — Begin! Round 1 is open.";
    }
    revalidatePath(`/${slug}`);
    bump(me.tournamentId);
    return { ok: true, message };
  } catch (e) {
    return fail(e);
  }
}

export async function sysadminDeleteAction(tournamentId: string): Promise<ActionState> {
  try {
    await requireSysadmin();
    const db = await getDb();
    await deleteTournament(db, tournamentId);
    revalidatePath("/sysadmin");
    return { ok: true, message: "Tournament deleted." };
  } catch (e) {
    return fail(e);
  }
}

/** Admin deletes their own tournament (pre-publication only); lands on the homepage. */
export async function deleteTournamentAction(slug: string): Promise<ActionState> {
  const me = await requireAdmin(slug);
  const db = await getDb();
  try {
    await deleteOwnTournament(db, me.id);
  } catch (e) {
    return fail(e);
  }
  redirect("/");
}

/** Set or clear the submission deadline; `local` is a datetime-local value or null. */
export async function setDeadlineAction(
  slug: string,
  local: string | null,
  tzOffsetMin: number
): Promise<ActionState> {
  try {
    const admin = await requireAdmin(slug);
    const db = await getDb();
    const deadline = local ? parseLocalDatetime(local, tzOffsetMin) : null;
    await updateSubmissionDeadline(db, admin.tournamentId, deadline);
    revalidatePath(`/${slug}`);
    revalidatePath(`/${slug}/admin`);
    bump(admin.tournamentId);
    return { ok: true, message: deadline ? "Deadline set." : "Deadline cleared — you close submissions by publishing." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSettingsAction(
  slug: string,
  payload: {
    roundMinutes?: number;
    breakMinutes?: number;
    /** datetime-local value, null to clear, undefined to leave unchanged. */
    startAtLocal?: string | null;
    defaultSubmission?: string;
  },
  tzOffsetMin: number
): Promise<ActionState> {
  try {
    const admin = await requireAdmin(slug);
    const db = await getDb();
    await updateSettings(db, admin.tournamentId, {
      roundDurationS: payload.roundMinutes !== undefined ? Math.round(payload.roundMinutes * 60) : undefined,
      breakDurationS: payload.breakMinutes !== undefined ? Math.round(payload.breakMinutes * 60) : undefined,
      startAt:
        payload.startAtLocal === undefined
          ? undefined
          : payload.startAtLocal === null
            ? null
            : parseLocalDatetime(payload.startAtLocal, tzOffsetMin),
      defaultSubmission: payload.defaultSubmission,
    });
    revalidatePath(`/${slug}`);
    revalidatePath(`/${slug}/admin`);
    bump(admin.tournamentId);
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateThemeAction(slug: string, theme: ThemeOverrides | null): Promise<ActionState> {
  try {
    const admin = await requireAdmin(slug);
    const db = await getDb();
    await updateTheme(db, admin.tournamentId, theme);
    revalidatePath(`/${slug}`, "layout");
    bump(admin.tournamentId);
    return { ok: true, message: theme === null ? "Theme reset to defaults." : "Theme saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function publishBracketAction(slug: string): Promise<ActionState> {
  try {
    const admin = await requireAdmin(slug);
    const db = await getDb();
    const { n, numRounds } = await publishBracket(db, getEmailer(), baseUrl(), admin.tournamentId);
    revalidatePath(`/${slug}`);
    revalidatePath(`/${slug}/admin`);
    bump(admin.tournamentId);
    return { ok: true, message: `Bracket published: ${n} drafts, ${numRounds} rounds. Convening.` };
  } catch (e) {
    return fail(e);
  }
}

export async function beginAction(slug: string): Promise<ActionState> {
  try {
    const admin = await requireAdmin(slug);
    const db = await getDb();
    await beginTournament(db, admin.tournamentId, new Date());
    revalidatePath(`/${slug}`);
    bump(admin.tournamentId);
    return { ok: true, message: "Begin! Round 1 is open." };
  } catch (e) {
    return fail(e);
  }
}

export async function pauseAction(slug: string, resume: boolean): Promise<ActionState> {
  try {
    const admin = await requireAdmin(slug);
    const db = await getDb();
    if (resume) await unpauseTournament(db, admin.tournamentId, new Date());
    else await pauseTournament(db, admin.tournamentId, new Date());
    revalidatePath(`/${slug}`);
    bump(admin.tournamentId);
    return { ok: true, message: resume ? "Resumed." : "Paused." };
  } catch (e) {
    return fail(e);
  }
}

export async function workspaceAction(
  slug: string,
  mergeId: string,
  action: WorkspaceAction
): Promise<ActionState> {
  try {
    const me = await requireParticipant(slug);
    const db = await getDb();
    const { collab, syncMergeText } = await import("./collab");
    // Lock-in must act on the live CRDT text, not the debounced snapshot.
    if (action.type === "propose" || action.type === "confirm") {
      await syncMergeText(mergeId);
    }
    await mergeAction(db, mergeId, me.id, action, new Date());
    // Freezes (propose/lock) must reach the sync server's gate immediately.
    collab()?.invalidateGate(mergeId);
    revalidatePath(`/${slug}/merge/${mergeId}`);
    revalidatePath(`/${slug}`);
    bump(me.tournamentId);
    return { ok: true, message: "" };
  } catch (e) {
    return fail(e);
  }
}
