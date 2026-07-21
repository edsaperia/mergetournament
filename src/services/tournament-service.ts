/**
 * Service layer: the operations pages and server actions call. Pure with
 * respect to their inputs — the db handle, emailer, and base URL are
 * injected, so everything here is testable against PGlite with a
 * capture-emailer and no HTTP.
 */

import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import { auditLog, chatRooms, participants, textVersions, tournaments } from "../db/schema";
import { generateToken, hashToken } from "../lib/auth";
import { Emailer, inviteEmail, magicLink, scheduleLine, type Email } from "../lib/email";
import { DomainError } from "../lib/errors";
import { countWords } from "../lib/text";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

async function audit(db: Db, tournamentId: string, action: string, payload: unknown): Promise<void> {
  await db.insert(auditLog).values({ tournamentId, action, payload });
}

export interface CreateTournamentInput {
  slug: string;
  name: string;
  /** Defaults to 30 minutes; adjustable from admin settings until publication. */
  roundDurationS?: number;
  /** Defaults to 10 minutes; adjustable from admin settings until publication. */
  breakDurationS?: number;
  visibility?: "public" | "participants_only";
  defaultSubmission?: string;
  submissionDeadline?: Date;
  startAt?: Date;
}

export async function createTournament(db: Db, input: CreateTournamentInput) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.slug)) {
    throw new DomainError("slug must be lowercase letters, digits and hyphens (2-63 chars)");
  }
  const roundDurationS = input.roundDurationS ?? 1800;
  const breakDurationS = input.breakDurationS ?? 600;
  if (roundDurationS <= 0 || breakDurationS < 0) {
    throw new DomainError("durations must be positive (break may be zero)");
  }
  const [tournament] = await db
    .insert(tournaments)
    .values({
      slug: input.slug,
      name: input.name,
      roundDurationS,
      breakDurationS,
      visibility: input.visibility ?? "public",
      defaultSubmission: input.defaultSubmission ?? "",
      submissionDeadline: input.submissionDeadline,
      startAt: input.startAt,
      phase: "submission",
    })
    .returning();
  await db.insert(chatRooms).values({ tournamentId: tournament.id, kind: "global" });
  await audit(db, tournament.id, "tournament_created", { slug: input.slug });
  return tournament;
}

export interface AddParticipantInput {
  name: string;
  email: string;
  role?: "participant" | "admin";
}

/**
 * Add a participant and email them their magic link (SPEC §3, §4 Phase 1).
 * The raw token exists only in the emailed link; we store its hash.
 * Roster changes are only allowed before publication.
 */
export async function addParticipant(
  db: Db,
  emailer: Emailer,
  baseUrl: string,
  tournamentId: string,
  input: AddParticipantInput
) {
  const tournament = await requireTournament(db, tournamentId);
  if (tournament.phase !== "setup" && tournament.phase !== "submission") {
    throw new DomainError("the roster is frozen once the tournament has started");
  }
  const token = generateToken();
  const [participant] = await db
    .insert(participants)
    .values({
      tournamentId,
      name: input.name,
      email: input.email.toLowerCase().trim(),
      tokenHash: hashToken(token),
      role: input.role ?? "participant",
    })
    .returning();
  await emailer.send(
    await buildInvite(db, baseUrl, tournament, {
      to: participant.email,
      participantName: participant.name,
      selfIsAdmin: participant.role === "admin",
      magicLink: magicLink(baseUrl, tournament.slug, token),
    })
  );
  await audit(db, tournamentId, "participant_added", { participantId: participant.id, email: participant.email });
  return participant;
}

/**
 * The full invitation: who invited you, the admin's brief, the schedule as
 * currently known, then the magic link. One builder so every path that
 * (re)sends a link — add, re-issue, email change, test — reads the same.
 */
async function buildInvite(
  db: Db,
  baseUrl: string,
  tournament: typeof tournaments.$inferSelect,
  opts: { to: string; participantName: string; selfIsAdmin?: boolean; magicLink: string }
): Promise<Email> {
  const [admin] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.tournamentId, tournament.id), eq(participants.role, "admin")));
  return inviteEmail({
    to: opts.to,
    participantName: opts.participantName,
    tournamentName: tournament.name,
    adminName: opts.selfIsAdmin ? undefined : admin?.name,
    intro: tournament.intro,
    schedule: scheduleLine(tournament),
    magicLink: opts.magicLink,
    baseUrl,
  });
}

/**
 * Send the admin a preview of the invite email exactly as a participant
 * would receive it — with a placeholder where the personal link goes, so no
 * live token ever lands in a forwardable test email.
 */
export async function sendTestInvite(db: Db, emailer: Emailer, baseUrl: string, tournamentId: string) {
  const tournament = await requireTournament(db, tournamentId);
  const [admin] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.tournamentId, tournamentId), eq(participants.role, "admin")));
  if (!admin) throw new DomainError("no administrator on the roster");
  const email = await buildInvite(db, baseUrl, tournament, {
    to: admin.email,
    participantName: "Sam Participant",
    magicLink: "(each participant gets their own personal sign-in link here)",
  });
  await emailer.send({ ...email, subject: `[Test] ${email.subject}` });
}

/** Re-issue a magic link (SPEC §3: "admin can re-issue links"). Invalidates the old one. */
export async function reissueLink(
  db: Db,
  emailer: Emailer,
  baseUrl: string,
  tournamentId: string,
  participantId: string
) {
  const participant = await requireParticipant(db, participantId, tournamentId);
  const tournament = await requireTournament(db, participant.tournamentId);
  const token = generateToken();
  await db.update(participants).set({ tokenHash: hashToken(token) }).where(eq(participants.id, participantId));
  await emailer.send(
    await buildInvite(db, baseUrl, tournament, {
      to: participant.email,
      participantName: participant.name,
      selfIsAdmin: participant.role === "admin",
      magicLink: magicLink(baseUrl, tournament.slug, token),
    })
  );
  await audit(db, tournament.id, "link_reissued", { participantId });
}

/**
 * Rename a participant or change their email. An email change rotates the
 * magic link and invites the new address (the old link stops working, so a
 * wrong address never keeps access). Allowed at any phase — this corrects
 * identity details; the roster's composition is what freezes at publication.
 */
export async function updateParticipant(
  db: Db,
  emailer: Emailer,
  baseUrl: string,
  tournamentId: string,
  participantId: string,
  patch: { name?: string; email?: string }
) {
  const participant = await requireParticipant(db, participantId, tournamentId);
  const tournament = await requireTournament(db, participant.tournamentId);
  const updates: Partial<typeof participants.$inferInsert> = {};

  const name = patch.name?.trim();
  if (name !== undefined) {
    if (!name) throw new DomainError("name cannot be empty");
    updates.name = name;
  }

  const email = patch.email?.toLowerCase().trim();
  const emailChanged = email !== undefined && email !== participant.email;
  let token: string | null = null;
  if (emailChanged) {
    if (!email.includes("@")) throw new DomainError("that does not look like an email address");
    token = generateToken();
    updates.email = email;
    updates.tokenHash = hashToken(token);
  }

  if (Object.keys(updates).length === 0) return { participant, emailChanged: false };

  let updated;
  try {
    [updated] = await db.update(participants).set(updates).where(eq(participants.id, participantId)).returning();
  } catch (e) {
    // Unique violation (23505) hides in the wrapped error's cause chain.
    for (let err: unknown = e; err instanceof Error; err = err.cause) {
      const code = (err as { code?: string }).code;
      if (code === "23505" || /unique|duplicate/i.test(err.message)) {
        throw new DomainError("another participant already uses that email");
      }
    }
    throw e;
  }

  if (emailChanged && token) {
    await emailer.send(
      await buildInvite(db, baseUrl, tournament, {
        to: updated.email,
        participantName: updated.name,
        selfIsAdmin: updated.role === "admin",
        magicLink: magicLink(baseUrl, tournament.slug, token),
      })
    );
  }
  await audit(db, tournament.id, "participant_updated", {
    participantId,
    changes: Object.keys(updates).filter((k) => k !== "tokenHash"),
  });
  return { participant: updated, emailChanged };
}

export async function removeParticipant(db: Db, tournamentId: string, participantId: string): Promise<void> {
  const participant = await requireParticipant(db, participantId, tournamentId);
  const tournament = await requireTournament(db, participant.tournamentId);
  if (tournament.phase !== "setup" && tournament.phase !== "submission") {
    throw new DomainError("the roster is frozen once the tournament has started");
  }
  await db.delete(participants).where(eq(participants.id, participantId));
  await audit(db, tournament.id, "participant_removed", { participantId, email: participant.email });
}

/** Exchange a magic-link token for the participant it identifies, or null. */
export async function participantForToken(db: Db, slug: string, token: string) {
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.slug, slug));
  if (!tournament) return null;
  const [participant] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.tournamentId, tournament.id), eq(participants.tokenHash, hashToken(token))));
  return participant ?? null;
}

/**
 * Save a participant's draft (SPEC §4 Phase 1). One draft row per
 * participant, revised in place until submissions close; text immutability
 * begins at publication, when drafts enter the bracket.
 */
export async function saveDraft(db: Db, participantId: string, bodyMd: string) {
  const participant = await requireParticipant(db, participantId);
  if (participant.role === "admin") {
    throw new DomainError("the administrator does not submit a draft (SPEC §2)");
  }
  const tournament = await requireTournament(db, participant.tournamentId);
  if (tournament.phase !== "submission") {
    throw new DomainError("submissions are closed");
  }
  // 10s grace so a debounced autosave (or the editor's unmount flush when
  // the page flips to read-only) still captures the final keystrokes.
  if (tournament.submissionDeadline && Date.now() > tournament.submissionDeadline.getTime() + 10_000) {
    throw new DomainError("submissions are closed — the deadline has passed");
  }
  const wordCount = countWords(bodyMd);
  const [existing] = await db
    .select()
    .from(textVersions)
    .where(and(eq(textVersions.authorId, participantId), eq(textVersions.kind, "draft")));
  if (existing) {
    const [updated] = await db
      .update(textVersions)
      .set({ bodyMd, wordCount })
      .where(eq(textVersions.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(textVersions)
    .values({ tournamentId: tournament.id, kind: "draft", bodyMd, wordCount, authorId: participantId })
    .returning();
  await db.insert(chatRooms).values({ tournamentId: tournament.id, kind: "draft", subjectId: created.id });
  return created;
}

/**
 * Set or clear the submission deadline (SPEC §4 Phase 0: optional; if unset
 * the admin closes manually by publishing). Editable until publication —
 * extending a passed deadline reopens submissions.
 */
export async function updateSubmissionDeadline(
  db: Db,
  tournamentId: string,
  deadline: Date | null,
  tzOffsetMin?: number
) {
  const tournament = await requireTournament(db, tournamentId);
  if (tournament.phase !== "setup" && tournament.phase !== "submission") {
    throw new DomainError("the submission period has ended");
  }
  if (deadline && Number.isNaN(deadline.getTime())) throw new DomainError("invalid date");
  const [updated] = await db
    .update(tournaments)
    .set({
      submissionDeadline: deadline,
      ...(deadline && tzOffsetMin !== undefined ? { tzOffsetMin } : {}),
    })
    .where(eq(tournaments.id, tournamentId))
    .returning();
  await audit(db, tournamentId, "submission_deadline_changed", {
    deadline: deadline?.toISOString() ?? null,
  });
  return updated;
}

/**
 * Edit tournament settings (SPEC §4 Phase 0): durations and the default
 * submission until the bracket is published; the start datetime until the
 * tournament has begun (when set, it auto-begins once convening).
 */
export async function updateSettings(
  db: Db,
  tournamentId: string,
  patch: {
    roundDurationS?: number;
    breakDurationS?: number;
    /** Scheduled Start Tournament; editable until the tournament starts. */
    publishAt?: Date | null;
    startAt?: Date | null;
    defaultSubmission?: string;
    /** The participant brief; editable at any phase. */
    intro?: string;
    /** Editable at any phase — a display concern, not part of the record. */
    visibility?: "public" | "participants_only";
    /** Persisted whenever a scheduled time is set, for event-local email formatting. */
    tzOffsetMin?: number;
  }
) {
  const t = await requireTournament(db, tournamentId);
  const prePublish = t.phase === "setup" || t.phase === "submission";
  const updates: Partial<typeof tournaments.$inferInsert> = {};

  if (patch.roundDurationS !== undefined || patch.breakDurationS !== undefined || patch.defaultSubmission !== undefined) {
    if (!prePublish) throw new DomainError("durations and the template are editable until the tournament starts");
  }
  if (patch.roundDurationS !== undefined) {
    if (!Number.isInteger(patch.roundDurationS) || patch.roundDurationS <= 0) throw new DomainError("round duration must be positive");
    updates.roundDurationS = patch.roundDurationS;
  }
  if (patch.breakDurationS !== undefined) {
    if (!Number.isInteger(patch.breakDurationS) || patch.breakDurationS < 0) throw new DomainError("break duration cannot be negative");
    updates.breakDurationS = patch.breakDurationS;
  }
  if (patch.defaultSubmission !== undefined) {
    updates.defaultSubmission = patch.defaultSubmission;
  }
  if (patch.intro !== undefined) {
    updates.intro = patch.intro;
  }
  if (patch.visibility !== undefined) {
    updates.visibility = patch.visibility;
  }
  if (patch.publishAt !== undefined) {
    if (!prePublish) throw new DomainError("the tournament has already started");
    if (patch.publishAt && Number.isNaN(patch.publishAt.getTime())) throw new DomainError("invalid date");
    updates.publishAt = patch.publishAt;
  }
  if ((patch.publishAt || patch.startAt) && patch.tzOffsetMin !== undefined) {
    updates.tzOffsetMin = patch.tzOffsetMin;
  }
  if (patch.startAt !== undefined) {
    if (t.begunAt || t.phase === "running" || t.phase === "complete") {
      throw new DomainError("the tournament has already started");
    }
    if (patch.startAt && Number.isNaN(patch.startAt.getTime())) throw new DomainError("invalid date");
    updates.startAt = patch.startAt;
  }
  if (Object.keys(updates).length === 0) return t;

  const [updated] = await db.update(tournaments).set(updates).where(eq(tournaments.id, tournamentId)).returning();
  await audit(db, tournamentId, "settings_changed", { changes: Object.keys(updates) });
  return updated;
}

/** Set or clear the tournament's color theme (validated token overrides). */
export async function updateTheme(db: Db, tournamentId: string, theme: unknown | null) {
  await requireTournament(db, tournamentId);
  const { validateTheme } = await import("../lib/theme");
  const validated = theme === null ? null : validateTheme(theme);
  const [updated] = await db
    .update(tournaments)
    .set({ theme: validated })
    .where(eq(tournaments.id, tournamentId))
    .returning();
  await audit(db, tournamentId, "theme_changed", { cleared: validated === null });
  return updated;
}

/** Admin dashboard rows (SPEC §4 Phase 1): submission status per participant. */
export async function submissionStatus(db: Db, tournamentId: string) {
  const roster = await db
    .select()
    .from(participants)
    .where(eq(participants.tournamentId, tournamentId))
    .orderBy(participants.createdAt);
  const drafts = await db
    .select()
    .from(textVersions)
    .where(and(eq(textVersions.tournamentId, tournamentId), eq(textVersions.kind, "draft")));
  const byAuthor = new Map(drafts.map((d) => [d.authorId, d]));
  return roster.map((p) => ({
    participant: p,
    draft: byAuthor.get(p.id) ?? null,
  }));
}

async function requireTournament(db: Db, id: string) {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!t) throw new DomainError("tournament not found");
  return t;
}

/**
 * When `tournamentId` is given, the lookup is scoped to that tournament —
 * callers acting on someone else's behalf (the admin roster actions) must
 * scope, so an id from another tournament reads as "not found".
 */
async function requireParticipant(db: Db, id: string, tournamentId?: string) {
  const [p] = await db
    .select()
    .from(participants)
    .where(
      tournamentId
        ? and(eq(participants.id, id), eq(participants.tournamentId, tournamentId))
        : eq(participants.id, id)
    );
  if (!p) throw new DomainError("participant not found");
  return p;
}
