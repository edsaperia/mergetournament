import { notFound } from "next/navigation";
import { currentParticipant, tournamentBySlug } from "../../server/session";
import { AutoRefresh, RefreshAt } from "../live";
import { LocalTime } from "../local-time";
import { AdminDashboard } from "./admin/dashboard";
import { BellWithState } from "./bell-state";
import { BracketView } from "./bracket-view";
import { BreakPanel } from "./break-panel";
import { ConveningPanel } from "./convening-panel";
import { GlobalChat } from "./global-chat";
import { IntroSection } from "./intro-section";
import { MyDraft } from "./my-draft";

const PHASE_LABEL: Record<string, string> = {
  setup: "Being set up",
  submission: "Accepting submissions",
  convening: "Convening — the tournament has started",
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
        <p className="mt-4 text-soft">
          This tournament is private. Use the personal link from your invitation
          email to sign in.
        </p>
      </main>
    );
  }

  const live = tournament.phase === "convening" || tournament.phase === "running";
  const preStart = tournament.phase === "submission" || tournament.phase === "setup";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      {live && <AutoRefresh slug={slug} />}
      {tournament.phase === "submission" && tournament.submissionDeadline && (
        <RefreshAt iso={tournament.submissionDeadline.toISOString()} />
      )}
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-soft">{PHASE_LABEL[tournament.phase] ?? tournament.phase}</p>
        <nav className="flex items-center gap-3 text-sm">
          {me && live && <BellWithState tournament={tournament} participantId={me.id} />}
          {me && (
            <span className="text-muted">
              {me.name}
              {me.role === "admin" ? " (admin)" : ""}
            </span>
          )}
        </nav>
      </div>

      <IntroSection tournament={tournament} viewerRole={me?.role ?? null} />
      {tournament.phase === "convening" && (
        <ConveningPanel slug={slug} tournamentId={tournament.id} me={me} />
      )}
      {tournament.phase === "running" && (
        <BreakPanel slug={slug} tournament={tournament} participantId={me?.id ?? null} />
      )}
      <div className={preStart ? "grid gap-6" : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"}>
        <div className="min-w-0">
          {tournament.phase === "submission" && <SubmissionBody slug={slug} tournament={tournament} me={me} />}
          {!preStart && <BracketView tournament={tournament} viewerId={me?.id ?? null} />}
          {tournament.phase === "complete" && <ExportsSection slug={slug} />}
        </div>
        {!preStart && (
          <aside className="min-w-0">
            <GlobalChat slug={slug} tournamentId={tournament.id} canPost={Boolean(me)} />
          </aside>
        )}
      </div>
    </main>
  );
}

/** What the main column shows while submissions are open: your draft, the admin dashboard, or a waiting note. */
function SubmissionBody({
  slug,
  tournament,
  me,
}: {
  slug: string;
  tournament: { submissionDeadline: Date | null; defaultSubmission: string };
  me: { id: string; role: string } | null;
}) {
  if (me?.role === "admin") return <AdminDashboard slug={slug} />;
  if (!me || me.role !== "participant") {
    return (
      <p className="text-soft">
        Participants are writing their drafts. The bracket appears here
        when the admin starts the tournament.
      </p>
    );
  }
  const closed = Boolean(tournament.submissionDeadline && new Date() > tournament.submissionDeadline);
  return (
    <div className="flex flex-col gap-3">
      {closed ? (
        <p className="text-soft">
          Submissions closed at <LocalTime iso={tournament.submissionDeadline!.toISOString()} />.
          Your draft is in — the bracket appears when the admin starts the tournament.
        </p>
      ) : (
        <p className="text-soft">
          Write your draft below.
          {tournament.submissionDeadline && (
            <>
              {" "}Submissions will close at{" "}
              <LocalTime iso={tournament.submissionDeadline.toISOString()} />.
            </>
          )}
        </p>
      )}
      <MyDraft
        slug={slug}
        participantId={me.id}
        template={tournament.defaultSubmission}
        readOnly={closed}
      />
    </div>
  );
}

function ExportsSection({ slug }: { slug: string }) {
  return (
    <section className="mt-6 rounded-lg border border-edge p-4 text-sm">
      <h2 className="mb-2 font-semibold">Exports</h2>
      <ul className="flex flex-wrap gap-4">
        <li><a className="underline" href={`/${slug}/export/canonical.md`}>Canonical text</a></li>
        <li><a className="underline" href={`/${slug}/export/provenance.md`}>Provenance tree</a></li>
        <li><a className="underline" href={`/${slug}/export/drafts.md`}>Original drafts</a></li>
        <li><a className="underline" href={`/${slug}/export/audit.jsonl`}>Audit log</a></li>
      </ul>
    </section>
  );
}
