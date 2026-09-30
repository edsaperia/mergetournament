import { and, eq, inArray, max } from "drizzle-orm";
import { getDb } from "../../db";
import { chatRooms, messages as messagesTable } from "../../db/schema";
import { freshFlipsFor } from "../../server/queries";
import { globalRoom, messagesFor } from "../../services/chat-service";
import { ChatPanel } from "./chat-panel";

/** The tournament-wide chat room (SPEC §5), visible once the bracket exists. */
export async function GlobalChat({
  slug,
  tournamentId,
  canPost,
}: {
  slug: string;
  tournamentId: string;
  canPost: boolean;
}) {
  const db = await getDb();
  const room = await globalRoom(db, tournamentId);
  if (!room) return null;
  const messages = await messagesFor(db, room.id);

  // Lines posted along with a coin flip's result — who stands over, who pairs
  // up — name its winner, so they wait for the coin to land. They share the
  // flip's transaction, and so the timestamp of the result line in the merge's
  // own room.
  const flips = await freshFlipsFor(tournamentId);
  const keysAt = new Map<number, string[]>();
  if (flips.length > 0) {
    const resolvedAt = await db
      .select({ mergeId: chatRooms.subjectId, at: max(messagesTable.createdAt) })
      .from(chatRooms)
      .innerJoin(messagesTable, eq(messagesTable.roomId, chatRooms.id))
      .where(
        and(
          eq(chatRooms.tournamentId, tournamentId),
          eq(chatRooms.kind, "merge"),
          inArray(chatRooms.subjectId, flips.map((f) => f.key)),
          eq(messagesTable.kind, "system")
        )
      )
      .groupBy(chatRooms.subjectId);
    for (const { mergeId, at } of resolvedAt) {
      if (!mergeId || !at) continue;
      const t = new Date(at).getTime();
      keysAt.set(t, [...(keysAt.get(t) ?? []), mergeId]);
    }
  }
  const shown = messages.map((m) =>
    m.kind === "system" && keysAt.has(m.at.getTime()) ? { ...m, flipKeys: keysAt.get(m.at.getTime()) } : m
  );
  return <ChatPanel slug={slug} roomId={room.id} title="Tournament chat" messages={shown} canPost={canPost} />;
}
