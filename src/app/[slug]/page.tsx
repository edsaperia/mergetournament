import Link from "next/link";
import { notFound } from "next/navigation";
import { currentParticipant, tournamentBySlug } from "../../server/session";

const PHASE_LABEL: Record<string, string> = {
  setup: "Being set up",
  submission: "Accepting submissions",
  convening: "Convening — the bracket is published",
  running: "Underway",
  complete: "Complete",
};

export default async function TournamentPage(props: PageProps<"/[slug]">) {
  const { slug } = await props.params;
  const tournament = await tournamentBySlug(slug);
  if (!tournament) notFound();

  const me = await currentParticipant(slug);
  if (tournament.visibility === "participants_only" && !me) {
    return (
      <main className="mx-auto max-w-xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <p className="mt-4 text-neutral-600 dark:text-neutral-300">
          This tournament is private. Use the personal link from your invitation
          email to sign in.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-3xl font-bold">{tournament.name}</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-300">
        {PHASE_LABEL[tournament.phase] ?? tournament.phase}
      </p>
      {me && (
        <p className="mt-4 text-sm text-neutral-500">
          Signed in as <strong>{me.name}</strong>
          {me.role === "admin" ? " (administrator)" : ""}
        </p>
      )}
      <nav className="mt-8 flex gap-4">
        {me && tournament.phase === "submission" && (
          <Link
            className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
            href={`/${slug}/submit`}
          >
            {me.role === "admin" ? "View submissions" : "Edit your draft"}
          </Link>
        )}
        {me?.role === "admin" && (
          <Link
            className="rounded-lg border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            href={`/${slug}/admin`}
          >
            Admin dashboard
          </Link>
        )}
      </nav>
      {tournament.phase === "convening" || tournament.phase === "running" ? (
        <p className="mt-8 text-neutral-500">The bracket view arrives in a later milestone.</p>
      ) : null}
    </main>
  );
}
