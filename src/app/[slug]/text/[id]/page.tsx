import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { participants, textVersions } from "../../../../db/schema";
import { currentParticipant, tournamentBySlug } from "../../../../server/session";

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

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <p className="mb-2 text-sm text-neutral-500">
        <Link className="hover:underline" href={`/${slug}`}>{tournament.name}</Link>
        {" · "}
        {text.kind === "draft" ? `draft by ${author?.name ?? "?"}` : "merged text"}
        {" · "}{text.wordCount} words
      </p>
      {(text.parentAId || text.parentBId) && (
        <p className="mb-6 text-sm text-neutral-500">
          Merged from{" "}
          <Link className="underline" href={`/${slug}/text/${text.parentAId}`}>parent A</Link>
          {" and "}
          <Link className="underline" href={`/${slug}/text/${text.parentBId}`}>parent B</Link>
        </p>
      )}
      <article className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">{text.bodyMd}</pre>
      </article>
    </main>
  );
}
