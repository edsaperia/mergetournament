/**
 * Database schema (SPEC §6). Postgres via Drizzle.
 *
 * Conventions:
 * - All times that participate in schedule arithmetic are stored as integer
 *   "effective seconds since Begin" (see src/lib/schedule.ts), not wall
 *   clock; wall-clock instants (createdAt, begunAt, pausedAt) are timestamps.
 * - Text versions are immutable; parent links form the provenance tree.
 * - Random seeds are recorded wherever the system makes a random choice.
 */

import {
  boolean,
  index,
  integer,
  bigint,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const tournamentPhase = pgEnum("tournament_phase", [
  "setup",
  "submission",
  "convening",
  "running",
  "complete",
]);

export const visibility = pgEnum("visibility", ["public", "participants_only"]);

export const participantRole = pgEnum("participant_role", ["participant", "admin"]);

export const textKind = pgEnum("text_kind", ["draft", "merge_result", "working_archived"]);

export const slotKind = pgEnum("slot_kind", ["merge", "bye"]);

export const mergeState = pgEnum("merge_state", ["pending", "open", "locked", "resolved"]);

export const mergeResolution = pgEnum("merge_resolution", [
  "agreed",
  "bearer_flip",
  "backstop_flip",
  "active_advance",
  "abandoned",
  "walkover",
]);

/** "closing" is the 60s are-you-still-here window after the clock expires. */
export const roundState = pgEnum("round_state", ["scheduled", "open", "closing", "closed"]);

export const mergeSide = pgEnum("merge_side", ["A", "B"]);

/** A sole active bearer's pick for the backstop: the working text or their own input. */
export const advanceChoice = pgEnum("advance_choice", ["working", "input"]);

/** A slot's output: pending until its round resolves, then filled or empty. */
export const slotOutState = pgEnum("slot_out_state", ["pending", "filled", "empty"]);

export const roomKind = pgEnum("room_kind", ["global", "draft", "merge"]);

export const messageKind = pgEnum("message_kind", ["user", "system"]);

export const tournaments = pgTable("tournaments", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  phase: tournamentPhase("phase").notNull().default("setup"),
  visibility: visibility("visibility").notNull().default("public"),
  roundDurationS: integer("round_duration_s").notNull(),
  breakDurationS: integer("break_duration_s").notNull(),
  /** Optional; if unset the admin closes submissions manually. */
  submissionDeadline: timestamp("submission_deadline", { withTimezone: true }),
  /** Optional; if unset the admin starts manually. */
  startAt: timestamp("start_at", { withTimezone: true }),
  /** Wall-clock instant of the admin pressing Begin. */
  begunAt: timestamp("begun_at", { withTimezone: true }),
  /** Master seed for bracket seeding; per-flip seeds live on merges / audit log. */
  seed: bigint("seed", { mode: "number" }),
  /**
   * Commit-reveal (fairness): generated at publish, its hash posted publicly
   * then; every random draw derives from it; revealed at completion.
   */
  masterSecret: text("master_secret"),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  totalPausedS: integer("total_paused_s").notNull().default(0),
  /** Template all submissions initialise as. */
  defaultSubmission: text("default_submission").notNull().default(""),
  /** Per-tournament color overrides: token key -> { light, dark } hex (src/lib/theme.ts). */
  theme: jsonb("theme"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    role: participantRole("role").notNull().default("participant"),
    /** Convening (SPEC §4): the tournament begins when every participant is ready. */
    ready: boolean("ready").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("participants_tournament_email").on(t.tournamentId, t.email),
    index("participants_token_hash").on(t.tokenHash),
  ]
);

export const textVersions = pgTable(
  "text_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    kind: textKind("kind").notNull(),
    bodyMd: text("body_md").notNull(),
    wordCount: integer("word_count").notNull(),
    /** Both null for drafts; both set for merge results. Immutable. */
    parentAId: uuid("parent_a_id").references((): AnyPgColumn => textVersions.id),
    parentBId: uuid("parent_b_id").references((): AnyPgColumn => textVersions.id),
    /** The submitting participant, for drafts. */
    authorId: uuid("author_id").references(() => participants.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("text_versions_tournament").on(t.tournamentId)]
);

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    /** Effective seconds since Begin (full-duration ceiling). */
    scheduledStartS: integer("scheduled_start_s").notNull(),
    actualStartS: integer("actual_start_s"),
    actualCloseS: integer("actual_close_s"),
    state: roundState("state").notNull().default("scheduled"),
  },
  (t) => [uniqueIndex("rounds_tournament_number").on(t.tournamentId, t.number)]
);

export const slots = pgTable(
  "slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    roundNo: integer("round_no").notNull(),
    position: integer("position").notNull(),
    kind: slotKind("kind").notNull(),
    /** What this slot passes to the next round, once known. */
    outState: slotOutState("out_state").notNull().default("pending"),
    outTextId: uuid("out_text_id").references(() => textVersions.id),
    outBearerId: uuid("out_bearer_id").references(() => participants.id),
  },
  (t) => [uniqueIndex("slots_tournament_round_position").on(t.tournamentId, t.roundNo, t.position)]
);

export const merges = pgTable(
  "merges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => slots.id, { onDelete: "cascade" }),
    /** True for ad-hoc merges pairing idle texts; their result takes this slot's position. */
    isAdHoc: boolean("is_ad_hoc").notNull().default(false),
    textAId: uuid("text_a_id").references(() => textVersions.id),
    textBId: uuid("text_b_id").references(() => textVersions.id),
    bearerAId: uuid("bearer_a_id").references(() => participants.id),
    bearerBId: uuid("bearer_b_id").references(() => participants.id),
    /** Yjs document name on the sync server. */
    ydocRef: text("ydoc_ref"),
    state: mergeState("state").notNull().default("pending"),
    /** Live negotiation state (SPEC §4 Phase 3), persisted between actions. */
    workingText: text("working_text").notNull().default(""),
    proposedBy: mergeSide("proposed_by"),
    bearerPrefA: mergeSide("bearer_pref_a"),
    bearerPrefB: mergeSide("bearer_pref_b"),
    activeA: boolean("active_a").notNull().default(false),
    activeB: boolean("active_b").notNull().default(false),
    activeChoiceA: advanceChoice("active_choice_a"),
    activeChoiceB: advanceChoice("active_choice_b"),
    /** Break-time readiness for a pending merge: gates early round starts. */
    readyA: boolean("ready_a").notNull().default(false),
    readyB: boolean("ready_b").notNull().default(false),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    resultTextId: uuid("result_text_id").references(() => textVersions.id),
    advancingBearerId: uuid("advancing_bearer_id").references(() => participants.id),
    resolution: mergeResolution("resolution"),
    flipSeed: bigint("flip_seed", { mode: "number" }),
    /** When the resolution happened — flips only animate if it was recent. */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("merges_slot").on(t.slotId)]
);

export const chatRooms = pgTable(
  "chat_rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    kind: roomKind("kind").notNull(),
    /** The draft text id or merge id this room belongs to; null for global. */
    subjectId: uuid("subject_id"),
  },
  (t) => [uniqueIndex("chat_rooms_tournament_kind_subject").on(t.tournamentId, t.kind, t.subjectId)]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),
    /** Null for system messages. */
    authorId: uuid("author_id").references(() => participants.id),
    kind: messageKind("kind").notNull().default("user"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_room_created").on(t.roomId, t.createdAt)]
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => participants.id),
    textVersionId: uuid("text_version_id")
      .notNull()
      .references(() => textVersions.id, { onDelete: "cascade" }),
    rangeStart: integer("range_start").notNull(),
    rangeEnd: integer("range_end").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_text_version").on(t.textVersionId)]
);

/** Delivery events from the email provider's webhooks, keyed by address. */
export const emailEvents = pgTable(
  "email_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    email: text("email").notNull(),
    /** e.g. email.sent, email.delivered, email.bounced, email.complained */
    event: text("event").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_events_email_created").on(t.email, t.createdAt)]
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_tournament_created").on(t.tournamentId, t.createdAt)]
);

export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;
export type Participant = typeof participants.$inferSelect;
export type TextVersion = typeof textVersions.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type SlotRow = typeof slots.$inferSelect;
export type Merge = typeof merges.$inferSelect;
export type ChatRoom = typeof chatRooms.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
