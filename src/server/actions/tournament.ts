"use server";

import { redirect } from "next/navigation";
import { getDb } from "../../db";
import { tournamentCreatedEmail } from "../../lib/email";
import type { ThemeOverrides } from "../../lib/theme";
import {
  addParticipant,
  createTournament,
  sendTestInvite,
  updateSettings,
  updateSubmissionDeadline,
  updateTheme,
} from "../../services/tournament-service";
import { deleteOwnTournament } from "../../services/sysadmin-service";
import { baseUrl, getEmailer, sysadminEmail } from "../config";
import { requireAdmin } from "../session";
import { fail, lastDevLink, parseLocalDatetime, withAdmin, type ActionState } from "./shared";

export async function createTournamentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = await getDb();
    const slug = String(formData.get("slug") ?? "").trim();
    // Name, slug, and the admin's identity are all creation asks for; every
    // other knob (durations, deadline, visibility, template, theme) lives in
    // admin settings with sensible defaults.
    const tournament = await createTournament(db, {
      slug,
      name: String(formData.get("name") ?? "").trim() || slug,
    });
    const adminName = String(formData.get("adminName") ?? "").trim() || "Admin";
    const adminEmail = String(formData.get("adminEmail") ?? "").trim();
    await addParticipant(db, getEmailer(), baseUrl(), tournament.id, {
      name: adminName,
      email: adminEmail,
      role: "admin",
    });
    const operator = sysadminEmail();
    if (operator) {
      await getEmailer().send(
        tournamentCreatedEmail({
          to: operator,
          tournamentName: tournament.name,
          tournamentUrl: `${baseUrl()}/${tournament.slug}`,
          creatorName: adminName,
          creatorEmail: adminEmail,
          sysadminUrl: `${baseUrl()}/sysadmin`,
        })
      );
    }
    return {
      ok: true,
      message: `Created "${tournament.name}". Your admin magic link has been emailed.`,
      devLink: lastDevLink(),
    };
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
    await updateSubmissionDeadline(db, admin.tournamentId, deadline, tzOffsetMin);
    return { message: deadline ? "Deadline set." : "Deadline cleared — submissions close when you start the tournament." };
  });
}

export async function updateSettingsAction(
  slug: string,
  payload: {
    roundMinutes?: number;
    breakMinutes?: number;
    /** datetime-local values, null to clear, undefined to leave unchanged. */
    publishAtLocal?: string | null;
    startAtLocal?: string | null;
    defaultSubmission?: string;
    intro?: string;
    visibility?: "public" | "participants_only";
  },
  tzOffsetMin: number
): Promise<ActionState> {
  const fromLocal = (local: string | null | undefined) =>
    local === undefined ? undefined : local === null ? null : parseLocalDatetime(local, tzOffsetMin);
  return withAdmin(slug, { revalidate: [`/${slug}`, `/${slug}/admin`] }, async (db, admin) => {
    await updateSettings(db, admin.tournamentId, {
      roundDurationS: payload.roundMinutes !== undefined ? Math.round(payload.roundMinutes * 60) : undefined,
      breakDurationS: payload.breakMinutes !== undefined ? Math.round(payload.breakMinutes * 60) : undefined,
      publishAt: fromLocal(payload.publishAtLocal),
      startAt: fromLocal(payload.startAtLocal),
      defaultSubmission: payload.defaultSubmission,
      intro: payload.intro,
      visibility: payload.visibility,
      tzOffsetMin,
    });
    return { message: "Saved." };
  });
}

/** Email the admin a preview of the invite, with a placeholder for the link. */
export async function sendTestInviteAction(slug: string): Promise<ActionState> {
  return withAdmin(slug, { notify: false }, async (db, admin) => {
    await sendTestInvite(db, getEmailer(), baseUrl(), admin.tournamentId);
    return { message: `Test invite sent to ${admin.email}.`, devLink: undefined };
  });
}

/** Close submissions immediately (sets the deadline to now). */
export async function closeSubmissionsAction(slug: string): Promise<ActionState> {
  return withAdmin(slug, { revalidate: [`/${slug}`, `/${slug}/admin`] }, async (db, admin) => {
    await updateSubmissionDeadline(db, admin.tournamentId, new Date());
    return { message: "Submissions closed." };
  });
}

export async function updateThemeAction(slug: string, theme: ThemeOverrides | null): Promise<ActionState> {
  return withAdmin(slug, { revalidate: [[`/${slug}`, "layout"]] }, async (db, admin) => {
    await updateTheme(db, admin.tournamentId, theme);
    return { message: theme === null ? "Theme reset to defaults." : "Theme saved." };
  });
}
