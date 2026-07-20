"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { participants, tournaments } from "../db/schema";
import { ConsoleEmailer } from "../lib/email";
import { DomainError } from "../lib/errors";
import type { ThemeOverrides } from "../lib/theme";
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
  type Db,
} from "../services/tournament-service";
import {
  beginTournament,
  mergeAction,
  pauseTournament,
  publishBracket,
  unpauseTournament,
  type WorkspaceAction,
} from "../services/runtime-service";
import { deleteOwnTournament, deleteTournament } from "../services/sysadmin-service";
import { baseUrl, getEmailer, isProd } from "./config";
import { bump } from "./events";
import { requireAdmin, requireParticipant, requireSysadmin } from "./session";

export interface ActionState {
  ok: boolean;
  message: string;
  /** Dev-only convenience: with the console emailer, surface the magic link in the UI. */
  devLink?: string;
}

/** DomainError messages are written for users; anything else is logged, never leaked. */
function fail(e: unknown): ActionState {
  unstable_rethrow(e); // redirect()/notFound() are control flow, not failures
  if (e instanceof DomainError) return { ok: false, message: e.message };
  console.error("[action]", e);
  return { ok: false, message: "something went wrong — please try again" };
}

/** With the console emailer (no email service configured), expose the last link for the UI. */
function lastDevLink(): string | undefined {
  const emailer = getEmailer();
  if (isProd() || !(emailer instanceof ConsoleEmailer)) return undefined;
  const last = emailer.sent.at(-1);
  return last?.text.match(/https?:\S+/)?.[0];
}

/** Convert a datetime-local value + the client's UTC offset into an instant. */
function parseLocalDatetime(value: string, tzOffsetMin: number): Date {
  const asUtc = Date.parse(`${value}:00Z`);
  if (Number.isNaN(asUtc)) throw new DomainError("invalid date");
  return new Date(asUtc + tzOffsetMin * 60_000);
}

type Participant = Awaited<ReturnType<typeof requireParticipant>>;

interface WrapOptions {
  /** Paths to revalidate on success; a [path, "layout"] entry revalidates the subtree. */
  revalidate?: Array<string | [string, "layout"]>;
  /** Nudge live clients over SSE after the work (default true). */
  notify?: boolean;
}

/**
 * The shared scaffold of every tournament-scoped action: authorize, get the
 * db, do the work, revalidate, bump live clients, and convert thrown rule
 * violations into ActionState — auth failures included, so callers always
 * get a uniform { ok: false } instead of an error boundary.
 */
async function withSession(
  authorize: () => Promise<Participant>,
  opts: WrapOptions,
  fn: (db: Db, me: Participant) => Promise<Partial<ActionState> | void>
): Promise<ActionState> {
  try {
    const me = await authorize();
    const db = await getDb();
    const out = (await fn(db, me)) ?? {};
    for (const path of opts.revalidate ?? []) {
      if (Array.isArray(path)) revalidatePath(path[0], path[1]);
      else revalidatePath(path);
    }
    if (opts.notify !== false) bump(me.tournamentId);
    return { ok: true, message: "", ...out };
  } catch (e) {
    return fail(e);
  }
}

const withParticipant = (
  slug: string,
  opts: WrapOptions,
  fn: (db: Db, me: Participant) => Promise<Partial<ActionState> | void>
) => withSession(() => requireParticipant(slug), opts, fn);

const withAdmin = (
  slug: string,
  opts: WrapOptions,
  fn: (db: Db, admin: Participant) => Promise<Partial<ActionState> | void>
) => withSession(() => requireAdmin(slug), opts, fn);

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
  return withParticipant(slug, { revalidate: [`/${slug}/submit`] }, async (db, me) => {
    const draft = await saveDraft(db, me.id, body);
    return { message: `Saved · ${draft.wordCount} words` };
  });
}

export async function addParticipantAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return withAdmin(slug, { revalidate: [`/${slug}/admin`], notify: false }, async (db, admin) => {
    const p = await addParticipant(db, getEmailer(), baseUrl(), admin.tournamentId, {
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
    });
    return { message: `Invited ${p.name} <${p.email}>.`, devLink: lastDevLink() };
  });
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
      return { message: "Everyone is ready — Begin! Round 1 is open." };
    }
    return { message: "You're ready." };
  });
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
  try {
    const me = await requireAdmin(slug);
    const db = await getDb();
    await deleteOwnTournament(db, me.id);
    redirect("/"); // throws; fail() rethrows it past the catch
  } catch (e) {
    return fail(e);
  }
}

/** Set or clear the submission deadline; `local` is a datetime-local value or null. */
export async function setDeadlineAction(
  slug: string,
  local: string | null,
  tzOffsetMin: number
): Promise<ActionState> {
  return withAdmin(slug, { revalidate: [`/${slug}`, `/${slug}/admin`] }, async (db, admin) => {
    const deadline = local ? parseLocalDatetime(local, tzOffsetMin) : null;
    await updateSubmissionDeadline(db, admin.tournamentId, deadline);
    return { message: deadline ? "Deadline set." : "Deadline cleared — you close submissions by publishing." };
  });
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
  return withAdmin(slug, { revalidate: [`/${slug}`, `/${slug}/admin`] }, async (db, admin) => {
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
    return { message: "Settings saved." };
  });
}

export async function updateThemeAction(slug: string, theme: ThemeOverrides | null): Promise<ActionState> {
  return withAdmin(slug, { revalidate: [[`/${slug}`, "layout"]] }, async (db, admin) => {
    await updateTheme(db, admin.tournamentId, theme);
    return { message: theme === null ? "Theme reset to defaults." : "Theme saved." };
  });
}

export async function publishBracketAction(slug: string): Promise<ActionState> {
  return withAdmin(slug, { revalidate: [`/${slug}`, `/${slug}/admin`] }, async (db, admin) => {
    const { n, numRounds } = await publishBracket(db, getEmailer(), baseUrl(), admin.tournamentId);
    return { message: `Bracket published: ${n} drafts, ${numRounds} rounds. Convening.` };
  });
}

export async function beginAction(slug: string): Promise<ActionState> {
  return withAdmin(slug, { revalidate: [`/${slug}`] }, async (db, admin) => {
    await beginTournament(db, admin.tournamentId, new Date());
    return { message: "Begin! Round 1 is open." };
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
    const { collab, syncMergeText } = await import("./collab");
    // Lock-in must act on the live CRDT text, not the debounced snapshot.
    if (action.type === "propose" || action.type === "confirm") {
      await syncMergeText(mergeId);
    }
    await mergeAction(db, mergeId, me.id, action, new Date());
    // Freezes (propose/lock) must reach the sync server's gate immediately.
    collab()?.invalidateGate(mergeId);
  });
}
