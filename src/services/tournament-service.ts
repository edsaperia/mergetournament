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
import { Emailer, inviteEmail, magicLink } from "../lib/email";
import { countWords } from "../lib/text";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

async function audit(db: Db, tournamentId: string, action: string, payload: unknown): Promise<void> {
  await db.insert(auditLog).values({ tournamentId, action, payload });
}

export interface CreateTournamentInput {
  slug: string;
  name: string;
  roundDurationS: number;
  breakDurationS: number;
  visibility?: "public" | "participants_only";
  defaultSubmission?: string;
  submissionDeadline?: Date;
  startAt?: Date;
}

export async function createTournament(db: Db, input: CreateTournamentInput) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.slug)) {
    throw new Error("slug must be lowercase letters, digits and hyphens (2-63 chars)");
  }
  if (input.roundDurationS <= 0 || input.breakDurationS < 0) {
    throw new Error("durations must be positive (break may be zero)");
  }
  const [tournament] = await db
    .insert(tournaments)
    .values({
      slug: input.slug,
      name: input.name,
      roundDurationS: input.roundDurationS,
      breakDurationS: input.breakDurationS,
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
    throw new Error("roster is frozen after publication");
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
    inviteEmail({
      to: participant.email,
      participantName: participant.name,
      tournamentName: tournament.name,
      magicLink: magicLink(baseUrl, tournament.slug, token),
    })
  );
  await audit(db, tournamentId, "participant_added", { participantId: participant.id, email: participant.email });
  return participant;
}

/** Re-issue a magic link (SPEC §3: "admin can re-issue links"). Invalidates the old one. */
export async function reissueLink(
  db: Db,
  emailer: Emailer,
  baseUrl: string,
  participantId: string
) {
  const participant = await requireParticipant(db, participantId);
  const tournament = await requireTournament(db, participant.tournamentId);
  const token = generateToken();
  await db.update(participants).set({ tokenHash: hashToken(token) }).where(eq(participants.id, participantId));
  await emailer.send(
    inviteEmail({
      to: participant.email,
      participantName: participant.name,
      tournamentName: tournament.name,
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
  participantId: string,
  patch: { name?: string; email?: string }
) {
  const participant = await requireParticipant(db, participantId);
  const tournament = await requireTournament(db, participant.tournamentId);
  const updates: Partial<typeof participants.$inferInsert> = {};

  const name = patch.name?.trim();
  if (name !== undefined) {
    if (!name) throw new Error("name cannot be empty");
    updates.name = name;
  }

  const email = patch.email?.toLowerCase().trim();
  const emailChanged = email !== undefined && email !== participant.email;
  let token: string | null = null;
  if (emailChanged) {
    if (!email.includes("@")) throw new Error("that does not look like an email address");
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
        throw new Error("another participant already uses that email");
      }
    }
    throw e;
  }

  if (emailChanged && token) {
    await emailer.send(
      inviteEmail({
        to: updated.email,
        participantName: updated.name,
        tournamentName: tournament.name,
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

export async function removeParticipant(db: Db, participantId: string): Promise<void> {
  const participant = await requireParticipant(db, participantId);
  const tournament = await requireTournament(db, participant.tournamentId);
  if (tournament.phase !== "setup" && tournament.phase !== "submission") {
    throw new Error("roster is frozen after publication");
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
  const tournament = await requireTournament(db, participant.tournamentId);
  if (tournament.phase !== "submission") {
    throw new Error("submissions are closed");
  }
  // 10s grace so a debounced autosave (or the editor's unmount flush when
  // the page flips to read-only) still captures the final keystrokes.
  if (tournament.submissionDeadline && Date.now() > tournament.submissionDeadline.getTime() + 10_000) {
    throw new Error("submissions are closed — the deadline has passed");
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
export async function updateSubmissionDeadline(db: Db, tournamentId: string, deadline: Date | null) {
  const tournament = await requireTournament(db, tournamentId);
  if (tournament.phase !== "setup" && tournament.phase !== "submission") {
    throw new Error("the submission period has ended");
  }
  if (deadline && Number.isNaN(deadline.getTime())) throw new Error("invalid date");
  const [updated] = await db
    .update(tournaments)
    .set({ submissionDeadline: deadline })
    .where(eq(tournaments.id, tournamentId))
    .returning();
  await audit(db, tournamentId, "submission_deadline_changed", {
    deadline: deadline?.toISOString() ?? null,
  });
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
  if (!t) throw new Error("tournament not found");
  return t;
}

async function requireParticipant(db: Db, id: string) {
  const [p] = await db.select().from(participants).where(eq(participants.id, id));
  if (!p) throw new Error("participant not found");
  return p;
}
