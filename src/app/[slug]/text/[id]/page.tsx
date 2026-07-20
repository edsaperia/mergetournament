import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { participants, textVersions } from "../../../../db/schema";
import { commentsFor, messagesFor, roomForText } from "../../../../services/chat-service";
import { currentParticipant, tournamentBySlug } from "../../../../server/session";
import { AutoRefresh } from "../../../live";
import { ChatPanel } from "../../chat-panel";
import { CommentableText } from "./commentable-text";

export default async function TextPage(props: PageProps<"/[slug]/text/[id]">) {
  const { slug, id } = await props.params;
  const tournament = await tournamentBySlug(slug);
  if (!tournament) notFound();
  const me = await currentParticipant(slug);
  if (tournament.visibility === "participants_only" && !me) notFound();

  const db = await getDb();
  const [text] = await db.select().from(textVersions).where(eq(textVersions.id, id));
  if (!text || text.tournamentId !== tournament.id) notFound();
  // Drafts stay private until the bracket is published.
  if (text.kind === "draft" && tournament.phase === "submission" && me?.role !== "admin" && me?.id !== text.authorId) {
    notFound();
  }

  const author = text.authorId
    ? (await db.select().from(participants).where(eq(participants.id, text.authorId)))[0]
    : null;
  const comments = await commentsFor(db, text.id);
  const room = await roomForText(db, text.id);
  const live = tournament.phase === "convening" || tournament.phase === "running";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      {live && <AutoRefresh slug={slug} />}
      <p className="mb-2 text-sm text-muted">
        <Link className="hover:underline" href={`/${slug}`}>{tournament.name}</Link>
        {" · "}
        {text.kind === "draft" ? `draft by ${author?.name ?? "?"}` : "merged text"}
        {" · "}{text.wordCount} words
      </p>
      {(text.parentAId || text.parentBId) && (
        <p className="mb-4 text-sm text-muted">
          Merged from{" "}
          <Link className="underline" href={`/${slug}/text/${text.parentAId}`}>parent A</Link>
          {" and "}
          <Link className="underline" href={`/${slug}/text/${text.parentBId}`}>parent B</Link>
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <CommentableText
          slug={slug}
          textId={text.id}
          body={text.bodyMd}
          comments={comments}
          // Comments attach to read-only text only (SPEC §5): drafts are still
          // editable until publication, so their comments begin at convening.
          canComment={Boolean(me) && !(text.kind === "draft" && tournament.phase === "submission")}
        />
        <aside className="min-w-0">
          {room && (
            <ChatPanel
              slug={slug}
              roomId={room.id}
              title="This text's chat"
              messages={await messagesFor(db, room.id)}
              canPost={Boolean(me) && me!.role !== "admin"}
            />
          )}
          {Boolean(me) && !(text.kind === "draft" && tournament.phase === "submission") && (
            <p className="mt-2 text-xs text-muted">
              Hover a line and click 💬 to comment on it.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
