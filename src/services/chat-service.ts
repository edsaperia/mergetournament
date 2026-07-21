/**
 * Chat and inline comments (SPEC §5). Chat directs attention; comments
 * provide detail in context. Rooms are perpetual — nothing ever closes.
 *
 * Posting rules: participants may post in any room; the admin only in the
 * global room (they are not a member of the others); observers in none.
 * Comments: any authenticated user, on any read-only text, anchored to a
 * line (rangeStart == rangeEnd == 0-based line index).
 */

import { and, asc, eq } from "drizzle-orm";
import { DomainError } from "../lib/errors";
import {
  chatRooms,
  comments,
  merges,
  messages,
  participants,
  textVersions,
  tournaments,
} from "../db/schema";
import type { Db } from "./tournament-service";

export async function globalRoom(db: Db, tournamentId: string) {
  const [room] = await db
    .select()
    .from(chatRooms)
    .where(and(eq(chatRooms.tournamentId, tournamentId), eq(chatRooms.kind, "global")));
  return room ?? null;
}

export async function roomForMerge(db: Db, mergeId: string) {
  const [room] = await db
    .select()
    .from(chatRooms)
    .where(and(eq(chatRooms.kind, "merge"), eq(chatRooms.subjectId, mergeId)));
  return room ?? null;
}

/**
 * The chat that travels with a text (SPEC §5): a draft's own room, or — for
 * merge results and archived working texts — the room of the merge that
 * produced it.
 */
export async function roomForText(db: Db, textVersionId: string) {
  const [text] = await db.select().from(textVersions).where(eq(textVersions.id, textVersionId));
  if (!text) return null;
  if (text.kind === "draft") {
    const [room] = await db
      .select()
      .from(chatRooms)
      .where(and(eq(chatRooms.kind, "draft"), eq(chatRooms.subjectId, text.id)));
    return room ?? null;
  }
  const [producer] = await db.select().from(merges).where(eq(merges.resultTextId, text.id));
  return producer ? roomForMerge(db, producer.id) : null;
}

export interface MessageView {
  id: string;
  kind: "user" | "system";
  author: string | null;
  body: string;
  at: Date;
}

export async function messagesFor(db: Db, roomId: string): Promise<MessageView[]> {
  const rows = await db
    .select({
      id: messages.id,
      kind: messages.kind,
      body: messages.body,
      at: messages.createdAt,
      author: participants.name,
    })
    .from(messages)
    .leftJoin(participants, eq(messages.authorId, participants.id))
    .where(eq(messages.roomId, roomId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
  return rows.map((r) => ({ ...r, author: r.author ?? null }));
}

export async function postMessage(db: Db, roomId: string, participantId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new DomainError("empty message");
  if (trimmed.length > 4000) throw new DomainError("message too long");
  const [room] = await db.select().from(chatRooms).where(eq(chatRooms.id, roomId));
  if (!room) throw new DomainError("room not found");
  const [author] = await db.select().from(participants).where(eq(participants.id, participantId));
  if (!author || author.tournamentId !== room.tournamentId) throw new DomainError("not a participant here");
  if (author.role === "admin" && room.kind !== "global") {
    throw new DomainError("the admin may only post in the global chat");
  }
  // Chat opens when the bracket is published; before that, heads-down writing.
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, room.tournamentId));
  if (t?.phase === "setup" || t?.phase === "submission") {
    throw new DomainError("chat opens when the tournament starts");
  }
  const [row] = await db
    .insert(messages)
    .values({ roomId, authorId: participantId, kind: "user", body: trimmed })
    .returning();
  return row;
}

export interface CommentView {
  id: string;
  line: number;
  author: string;
  body: string;
  at: Date;
}

export async function commentsFor(db: Db, textVersionId: string): Promise<CommentView[]> {
  const rows = await db
    .select({
      id: comments.id,
      line: comments.rangeStart,
      body: comments.body,
      at: comments.createdAt,
      author: participants.name,
    })
    .from(comments)
    .leftJoin(participants, eq(comments.authorId, participants.id))
    .where(eq(comments.textVersionId, textVersionId))
    .orderBy(asc(comments.rangeStart), asc(comments.createdAt));
  return rows.map((r) => ({ ...r, author: r.author ?? "?" }));
}

export async function addComment(
  db: Db,
  input: { textVersionId: string; authorId: string; line: number; body: string }
) {
  const trimmed = input.body.trim();
  if (!trimmed) throw new DomainError("empty comment");
  if (trimmed.length > 4000) throw new DomainError("comment too long");
  if (!Number.isInteger(input.line) || input.line < 0) throw new DomainError("bad line");
  const [text] = await db.select().from(textVersions).where(eq(textVersions.id, input.textVersionId));
  if (!text) throw new DomainError("text not found");
  const [author] = await db.select().from(participants).where(eq(participants.id, input.authorId));
  if (!author || author.tournamentId !== text.tournamentId) throw new DomainError("not a participant here");
  if (author.role === "admin") {
    throw new DomainError("the admin reads everything but does not comment");
  }
  // Comments attach to read-only text only (SPEC §5): drafts stay editable
  // until publication, so they take no comments during submission.
  if (text.kind === "draft") {
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, text.tournamentId));
    if (t?.phase === "setup" || t?.phase === "submission") {
      throw new DomainError("drafts take comments once the tournament starts");
    }
  }
  const lineCount = text.bodyMd.split("\n").length;
  if (input.line >= lineCount) throw new DomainError("line out of range");
  const [row] = await db
    .insert(comments)
    .values({
      tournamentId: text.tournamentId,
      authorId: input.authorId,
      textVersionId: input.textVersionId,
      rangeStart: input.line,
      rangeEnd: input.line,
      body: trimmed,
    })
    .returning();
  return row;
}
