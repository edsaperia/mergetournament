import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "../../../db";
import { numRounds } from "../../../lib/bracket";
import { totalDurationS } from "../../../lib/schedule";
import { submissionStatus } from "../../../services/tournament-service";
import { beginAction, deleteTournamentAction, pauseAction, publishBracketAction } from "../../../server/actions";
import { latestEmailEvents } from "../../../services/sysadmin-service";
import { currentParticipant, tournamentBySlug } from "../../../server/session";
import { ControlButton } from "./admin-controls";
import { DeadlineEditor } from "./deadline-editor";
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
        <p className="text-soft">
          The admin dashboard requires the administrator&apos;s personal link.
        </p>
      </main>
    );
  }

  const db = await getDb();
  const status = await submissionStatus(db, tournament.id);
  const delivery = await latestEmailEvents(db, status.map((s) => s.participant.email));
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
      <p className="mt-2 text-sm text-muted">
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
            draftId: draft?.id ?? null,
            draftBody: draft?.bodyMd ?? null,
            emailStatus: delivery.get(participant.email)?.event.replace("email.", "") ?? null,
          }))}
        />
      </section>
      <section className="mt-10 border-t border-edge pt-6">
        <h2 className="mb-3 text-lg font-semibold">Lifecycle</h2>
        {tournament.phase === "submission" && (
          <div className="mb-4">
            <DeadlineEditor slug={slug} deadlineIso={tournament.submissionDeadline?.toISOString() ?? null} />
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          {tournament.phase === "submission" && (
            <>
              <ControlButton
                action={publishBracketAction.bind(null, slug)}
                label="Publish Bracket"
                confirmText={`Publish the bracket with ${submitted} drafts? The roster freezes and everything becomes readable to participants.`}
              />
              <ControlButton
                action={deleteTournamentAction.bind(null, slug)}
                label="Delete tournament"
                primary={false}
                confirmText="Delete this tournament and all drafts? Only possible before publication. This cannot be undone."
              />
            </>
          )}
          {tournament.phase === "convening" && (
            <ControlButton
              action={beginAction.bind(null, slug)}
              label="Begin!"
              confirmText="Has everyone logged in, found their first partner, and sat down next to them? This starts the clock."
            />
          )}
          {tournament.phase === "running" && !tournament.pausedAt && (
            <ControlButton action={pauseAction.bind(null, slug, false)} label="Pause" primary={false} />
          )}
          {tournament.phase === "running" && tournament.pausedAt && (
            <ControlButton action={pauseAction.bind(null, slug, true)} label="Resume" />
          )}
          {(tournament.phase === "convening" || tournament.phase === "running") && (
            <p className="w-full text-sm text-muted">
              There is deliberately no other live control: no extending a round,
              no reassigning a pairing, no overriding a flip.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
