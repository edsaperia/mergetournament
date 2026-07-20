import Link from "next/link";
import { notFound } from "next/navigation";
import { currentParticipant, tournamentBySlug } from "../../server/session";
import { AutoRefresh } from "../live";
import { BracketView } from "./bracket-view";

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

  const live = tournament.phase === "convening" || tournament.phase === "running";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      {live && <AutoRefresh />}
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">{tournament.name}</h1>
          <p className="mt-1 text-neutral-600 dark:text-neutral-300">
            {PHASE_LABEL[tournament.phase] ?? tournament.phase}
          </p>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          {me && (
            <span className="text-neutral-500">
              {me.name}
              {me.role === "admin" ? " (admin)" : ""}
            </span>
          )}
          {me && tournament.phase === "submission" && (
            <Link className="rounded-lg bg-neutral-900 px-3 py-2 font-medium text-white dark:bg-white dark:text-neutral-900" href={`/${slug}/submit`}>
              {me.role === "admin" ? "Submissions" : "Edit your draft"}
            </Link>
          )}
          {me?.role === "admin" && (
            <Link className="rounded-lg border border-neutral-300 px-3 py-2 font-medium dark:border-neutral-700" href={`/${slug}/admin`}>
              Admin
            </Link>
          )}
        </nav>
      </div>

      {tournament.phase === "submission" && (
        <p className="text-neutral-600 dark:text-neutral-300">
          Participants are writing their drafts. The bracket appears here when
          the admin publishes it.
        </p>
      )}
      {tournament.phase !== "submission" && tournament.phase !== "setup" && (
        <BracketView tournament={tournament} viewerId={me?.id ?? null} />
      )}
    </main>
  );
}
