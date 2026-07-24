import { getDb } from "../../db";
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
  return <ChatPanel slug={slug} roomId={room.id} title="Tournament chat" messages={messages} canPost={canPost} />;
}
