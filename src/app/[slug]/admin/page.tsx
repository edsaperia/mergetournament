import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "../../../db";
import { numRounds } from "../../../lib/bracket";
import { totalDurationS } from "../../../lib/schedule";
import { submissionStatus } from "../../../services/tournament-service";
import { currentParticipant, tournamentBySlug } from "../../../server/session";
import { Roster } from "./roster";

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default async function AdminPage(props: PageProps<"/[slug]/admin">) {
  const { slug } = await props.params;
  const tournament = await tournamentBySlug(slug);
  if (!tournament) notFound();

  const me = await currentParticipant(slug);
  if (me?.role !== "admin") {
    return (
      <main className="mx-auto max-w-xl flex-1 px-6 py-16">
        <p className="text-neutral-600 dark:text-neutral-300">
          The admin dashboard requires the administrator&apos;s personal link.
        </p>
      </main>
    );
  }

  const db = await getDb();
  const status = await submissionStatus(db, tournament.id);
  const submitted = status.filter((s) => s.draft !== null).length;
  const n = Math.max(submitted, 2);
  const rounds = numRounds(n);
  const expected = totalDurationS({
    numRounds: rounds,
    roundDurationS: tournament.roundDurationS,
    breakDurationS: tournament.breakDurationS,
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <h1 className="text-xl font-bold">
        <Link className="hover:underline" href={`/${slug}`}>{tournament.name}</Link>
        {" — admin"}
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        Phase: {tournament.phase} · {submitted} of {status.length} drafts submitted
        {submitted >= 2 && (
          <>
            {" "}· at {submitted} drafts: {numRounds(submitted)} rounds, ≤{" "}
            {fmtDuration(
              totalDurationS({
                numRounds: numRounds(submitted),
                roundDurationS: tournament.roundDurationS,
                breakDurationS: tournament.breakDurationS,
              })
            )}
          </>
        )}
        {submitted < 2 && <> · needs ≥ 2 drafts ({rounds} rounds, ≤ {fmtDuration(expected)}, once it has them)</>}
      </p>
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Roster</h2>
        <Roster
          slug={slug}
          rows={status.map(({ participant, draft }) => ({
            id: participant.id,
            name: participant.name,
            email: participant.email,
            role: participant.role,
            wordCount: draft?.wordCount ?? null,
          }))}
        />
      </section>
      <section className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">
          Publish Bracket, Begin, and Pause arrive with the tournament-runtime milestone.
        </p>
      </section>
    </main>
  );
}
