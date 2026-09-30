import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { merges, participants, rounds, slots, textVersions } from "../../../../db/schema";
import type { Db } from "../../../../services/tournament-service";

/**
 * A human name for a text: a draft is "<author>'s draft"; a merge result is
 * the bearer pairing that produced it ("Ada + Bo") — far more memorable
 * than "parent A".
 */
async function labelForText(db: Db, textId: string): Promise<string> {
  const [t] = await db.select().from(textVersions).where(eq(textVersions.id, textId));
  if (!t) return "unknown text";
  if (t.kind === "draft") {
    const [author] = t.authorId
      ? await db.select().from(participants).where(eq(participants.id, t.authorId))
      : [];
    return author ? `${author.name}'s draft` : "a draft";
  }
  const producer = await producingMerge(db, t);
  if (producer?.bearerAId && producer.bearerBId) {
    const roster = await db
      .select()
      .from(participants)
      .where(eq(participants.tournamentId, t.tournamentId));
    const nameOf = new Map(roster.map((p) => [p.id, p.name]));
    return `${nameOf.get(producer.bearerAId) ?? "?"} + ${nameOf.get(producer.bearerBId) ?? "?"}`;
  }
  return "merged text";
}
import { commentsFor, messagesFor, producingMerge, roomForText } from "../../../../services/chat-service";
import { resolutionSentence } from "../../../../lib/resolution";

/**
 * How the tournament's final text was decided, if this is it: the final
 * round's merge, in the same words as its workspace banner.
 */
async function finalVerdict(db: Db, tournamentId: string, textId: string): Promise<string | null> {
  const allRounds = await db.select().from(rounds).where(eq(rounds.tournamentId, tournamentId));
  if (allRounds.length === 0) return null;
  const [finalSlot] = await db
    .select()
    .from(slots)
    .where(and(eq(slots.tournamentId, tournamentId), eq(slots.roundNo, allRounds.length)));
  if (finalSlot?.outState !== "filled" || finalSlot.outTextId !== textId) return null;
  const [finalMerge] = await db.select().from(merges).where(eq(merges.slotId, finalSlot.id));
  if (!finalMerge) return "Nothing reached the final against it, so it stood over as the final text.";
  const roster = await db.select().from(participants).where(eq(participants.tournamentId, tournamentId));
  const nameOf = (id: string | null) => roster.find((p) => p.id === id)?.name ?? "?";
  return resolutionSentence(finalMerge, nameOf, true);
}

/**
 * The caption under a merge result, true to how it was made: both bearers
 * agreed, or one took part alone and their Accept advanced it.
 */
async function madeBy(db: Db, text: { id: string; parentAId: string | null; parentBId: string | null; tournamentId: string }) {
  const producer = await producingMerge(db, text);
  if (!producer?.bearerAId || !producer.bearerBId) return null;
  const roster = await db.select().from(participants).where(eq(participants.tournamentId, text.tournamentId));
  const nameOf = (id: string | null) => roster.find((p) => p.id === id)?.name ?? "?";
  const a = nameOf(producer.bearerAId);
  const b = nameOf(producer.bearerBId);
  if (producer.resolution === "active_advance") {
    const writer = nameOf(producer.advancingBearerId);
    const absent = producer.advancingBearerId === producer.bearerAId ? b : a;
    return { verb: `Written by ${writer} alone from`, note: `${absent} didn't take part, so ${writer}'s Accept alone decided it.` };
  }
  return { verb: "Merged from", note: `Agreed by ${a} and ${b}.` };
}
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
  const verdict = tournament.phase === "complete" ? await finalVerdict(db, tournament.id, text.id) : null;
  const made = text.parentAId && text.parentBId ? await madeBy(db, text) : null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {live && <AutoRefresh slug={slug} />}
      <p className="mb-2 text-sm text-muted">
        <Link className="hover:underline" href={`/${slug}`}>{tournament.name}</Link>
        {" · "}
        {text.kind === "draft" ? `draft by ${author?.name ?? "?"}` : "merged text"}
        {" · "}{text.wordCount} words
      </p>
      {verdict && (
        <div className="mb-4 rounded-lg border-2 border-ok p-4">
          <h1 className="text-lg font-bold">🏆 The tournament&apos;s final (canonical) text</h1>
          <p className="mt-1 text-sm text-soft">How the final was decided: {verdict}</p>
        </div>
      )}
      {text.parentAId && text.parentBId && (
        <p className="mb-4 text-sm text-muted">
          {made?.verb ?? "Merged from"}{" "}
          <Link className="underline" href={`/${slug}/text/${text.parentAId}`}>
            {await labelForText(db, text.parentAId)}
          </Link>
          {" and "}
          <Link className="underline" href={`/${slug}/text/${text.parentBId}`}>
            {await labelForText(db, text.parentBId)}
          </Link>
          {made && <>. {made.note}</>}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <CommentableText
          slug={slug}
          textId={text.id}
          body={text.bodyMd}
          comments={comments}
          // Non-admin participants only (the admin reads but doesn't comment),
          // and never on drafts still editable during submission (SPEC §5).
          canComment={
            Boolean(me) &&
            me!.role !== "admin" &&
            !(text.kind === "draft" && tournament.phase === "submission")
          }
        />
        <aside className="min-w-0">
          {room && (
            <ChatPanel
              slug={slug}
              roomId={room.id}
              title="This text's chat"
              messages={await messagesFor(db, room.id)}
              canPost={Boolean(me) && me!.role !== "admin"}
              readOnlyNote={
                !me
                  ? "Sign in with your invitation link to chat."
                  : me.role === "admin"
                    ? "The admin reads everything but posts only in the tournament chat."
                    : undefined
              }
            />
          )}
          {!me && (
            <p className="mt-2 text-xs text-muted">Sign in with your invitation link to comment.</p>
          )}
          {Boolean(me) && !(text.kind === "draft" && tournament.phase === "submission") && (
            <p className="mt-2 text-xs text-muted">
              Tap or click 💬 beside a line to comment on it.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
