import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { textVersions } from "../../../db/schema";
import { currentParticipant, tournamentBySlug } from "../../../server/session";
import { LocalTime } from "../../local-time";
import { DraftEditor } from "./draft-editor";

export default async function SubmitPage(props: PageProps<"/[slug]/submit">) {
  const { slug } = await props.params;
  const tournament = await tournamentBySlug(slug);
  if (!tournament) notFound();

  const me = await currentParticipant(slug);
  if (me?.role === "admin") {
    return (
      <main className="mx-auto max-w-xl flex-1 px-6 py-16">
        <p className="text-soft">
          The administrator doesn&apos;t submit a draft — participants do.
          Review theirs from the admin dashboard.
        </p>
      </main>
    );
  }
  if (!me) {
    return (
      <main className="mx-auto max-w-xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <p className="mt-4 text-soft">
          To edit your draft, sign in with the personal link from your
          invitation email.
        </p>
      </main>
    );
  }

  const db = await getDb();
  const [draft] = await db
    .select()
    .from(textVersions)
    .where(and(eq(textVersions.authorId, me.id), eq(textVersions.kind, "draft")));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">
          <Link className="hover:underline" href={`/${slug}`}>{tournament.name}</Link>
          {" — your draft"}
        </h1>
        {tournament.submissionDeadline && (
          <span className="text-sm text-muted">
            due <LocalTime iso={tournament.submissionDeadline.toISOString()} />
          </span>
        )}
      </div>
      {tournament.phase === "submission" ? (
        <DraftEditor slug={slug} initialBody={draft?.bodyMd ?? tournament.defaultSubmission} />
      ) : (
        <p className="text-soft">Submissions are closed.</p>
      )}
    </main>
  );
}
