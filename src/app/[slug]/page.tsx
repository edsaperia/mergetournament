import { notFound } from "next/navigation";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../../db";
import { merges, participants, rounds, slots, type Tournament } from "../../db/schema";
import { roundRemainingS, warnThresholds, type RoundProgress } from "../../lib/schedule";
import { globalRoom, messagesFor } from "../../services/chat-service";
import { effectiveT } from "../../services/runtime-service";
import { readyAction, workspaceAction } from "../../server/actions";
import { currentParticipant, tournamentBySlug } from "../../server/session";
import { AutoRefresh, RefreshAt } from "../live";
import { LocalTime } from "../local-time";
import { NumberedText } from "../numbered-text";
import { ControlButton } from "./admin/admin-controls";
import { AdminDashboard } from "./admin/dashboard";
import { textVersions } from "../../db/schema";
import { BracketView } from "./bracket-view";
import { ChatPanel } from "./chat-panel";
import { NotificationBell } from "./notification-bell";
import { DraftEditor } from "./submit/draft-editor";

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
        <p className="mt-4 text-soft">
          This tournament is private. Use the personal link from your invitation
          email to sign in.
        </p>
      </main>
    );
  }

  const live = tournament.phase === "convening" || tournament.phase === "running";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
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

      {tournament.phase === "convening" && (
        <ConveningPanel slug={slug} tournamentId={tournament.id} me={me} />
      )}
      {tournament.phase === "running" && (
        <BreakPanel slug={slug} tournament={tournament} participantId={me?.id ?? null} />
      )}
      <div
        className={
          tournament.phase === "submission" || tournament.phase === "setup"
            ? "grid gap-6"
            : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
        }
      >
        <div className="min-w-0">
          {tournament.phase === "submission" &&
            (me && me.role === "participant" ? (
              <div className="flex flex-col gap-3">
                {tournament.submissionDeadline && new Date() > tournament.submissionDeadline ? (
                  <p className="text-soft">
                    Submissions closed at <LocalTime iso={tournament.submissionDeadline.toISOString()} />.
                    Your draft is in — the bracket appears when the admin publishes it.
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
                  readOnly={Boolean(tournament.submissionDeadline && new Date() > tournament.submissionDeadline)}
                />
              </div>
            ) : me?.role === "admin" ? (
              <AdminDashboard slug={slug} />
            ) : (
              <p className="text-soft">
                Participants are writing their drafts. The bracket appears here
                when the admin publishes it.
              </p>
            ))}
          {tournament.phase !== "submission" && tournament.phase !== "setup" && (
            <BracketView tournament={tournament} viewerId={me?.id ?? null} />
          )}
          {tournament.phase === "complete" && (
            <section className="mt-6 rounded-lg border border-edge p-4 text-sm">
              <h2 className="mb-2 font-semibold">Exports</h2>
              <ul className="flex flex-wrap gap-4">
                <li><a className="underline" href={`/${slug}/export/canonical.md`}>Canonical text</a></li>
                <li><a className="underline" href={`/${slug}/export/provenance.md`}>Provenance tree</a></li>
                <li><a className="underline" href={`/${slug}/export/drafts.md`}>Original drafts</a></li>
                <li><a className="underline" href={`/${slug}/export/audit.jsonl`}>Audit log</a></li>
              </ul>
            </section>
          )}
        </div>
        {tournament.phase !== "submission" && tournament.phase !== "setup" && (
          <aside className="min-w-0">
            <GlobalChat slug={slug} tournamentId={tournament.id} canPost={Boolean(me)} />
          </aside>
        )}
      </div>
    </main>
  );
}

/** The participant's always-open draft editor (SPEC §4 Phase 1). */
async function MyDraft({
  slug,
  participantId,
  template,
  readOnly = false,
}: {
  slug: string;
  participantId: string;
  template: string;
  readOnly?: boolean;
}) {
  const db = await getDb();
  const [draft] = await db
    .select()
    .from(textVersions)
    .where(and(eq(textVersions.authorId, participantId), eq(textVersions.kind, "draft")));
  if (readOnly) {
    return draft ? (
      <div className="rounded-md border border-edge">
        <NumberedText body={draft.bodyMd} />
      </div>
    ) : (
      <p className="text-faint">No draft was submitted.</p>
    );
  }
  return <DraftEditor slug={slug} initialBody={draft?.bodyMd ?? template} />;
}

/**
 * During a break: the next round starts early only when every bearer in it
 * has confirmed readiness (otherwise it waits for its printed time).
 */
async function BreakPanel({
  slug,
  tournament,
  participantId,
}: {
  slug: string;
  tournament: Tournament;
  participantId: string | null;
}) {
  const db = await getDb();
  const allRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, tournament.id))
    .orderBy(asc(rounds.number));
  // Only relevant during a break: no round open/closing, a scheduled one next.
  if (allRounds.some((r) => r.state === "open" || r.state === "closing")) return null;
  const next = allRounds.find((r) => r.state === "scheduled");
  if (!next) return null;

  const nextSlots = await db
    .select({ id: slots.id })
    .from(slots)
    .where(and(eq(slots.tournamentId, tournament.id), eq(slots.roundNo, next.number)));
  const pending = nextSlots.length
    ? await db
        .select()
        .from(merges)
        .where(and(inArray(merges.slotId, nextSlots.map((s) => s.id)), eq(merges.state, "pending")))
    : [];
  if (pending.length === 0) return null;

  const bearersTotal = pending.length * 2;
  const bearersReady = pending.reduce((n, m) => n + (m.readyA ? 1 : 0) + (m.readyB ? 1 : 0), 0);
  const mine = participantId
    ? pending.find((m) => m.bearerAId === participantId || m.bearerBId === participantId)
    : undefined;
  const iAmReady = mine
    ? mine.bearerAId === participantId
      ? mine.readyA
      : mine.readyB
    : false;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-edge p-4">
      <div>
        <p className="font-semibold">Break — round {next.number} is next</p>
        <p className="text-sm text-muted">
          Scheduled for +{Math.round(next.scheduledStartS / 60)}m; it starts
          sooner only when all its bearers are ready ({bearersReady} of {bearersTotal} so far).
        </p>
      </div>
      {mine && !iAmReady && (
        <ControlButton
          action={workspaceAction.bind(null, slug, mine.id, { type: "readyForRound" as const })}
          label={`I'm ready for round ${next.number}`}
        />
      )}
      {mine && iAmReady && <span className="text-sm font-medium text-green-600">You&apos;re ready ✓</span>}
    </div>
  );
}

/** Server-side snapshot feeding the notification bell's transition detection. */
async function BellWithState({ tournament, participantId }: { tournament: Tournament; participantId: string }) {
  const { warnAtS } = warnThresholds(tournament.roundDurationS);
  let myOpenMergeId: string | null = null;
  let roundNo: number | null = null;
  let remainingS: number | null = null;

  if (tournament.phase === "running" && tournament.begunAt && !tournament.pausedAt) {
    const db = await getDb();
    const allRounds = await db
      .select()
      .from(rounds)
      .where(eq(rounds.tournamentId, tournament.id))
      .orderBy(asc(rounds.number));
    const open = allRounds.find((r) => r.state === "open");
    if (open) {
      roundNo = open.number;
      const progress: RoundProgress[] = allRounds.map((r) => ({
        actualStart: r.actualStartS ?? undefined,
        actualClose: r.actualCloseS ?? undefined,
      }));
      remainingS = roundRemainingS(
        { numRounds: allRounds.length, roundDurationS: tournament.roundDurationS, breakDurationS: tournament.breakDurationS },
        progress,
        open.number,
        effectiveT(tournament, new Date())
      );
      const openSlots = await db
        .select({ id: slots.id })
        .from(slots)
        .where(and(eq(slots.tournamentId, tournament.id), eq(slots.roundNo, open.number)));
      if (openSlots.length > 0) {
        const [mine] = await db
          .select({ id: merges.id })
          .from(merges)
          .where(
            and(
              inArray(merges.slotId, openSlots.map((s) => s.id)),
              eq(merges.state, "open"),
              or(eq(merges.bearerAId, participantId), eq(merges.bearerBId, participantId))
            )
          );
        myOpenMergeId = mine?.id ?? null;
      }
    }
  }
  return (
    <NotificationBell
      myOpenMergeId={myOpenMergeId}
      roundNo={roundNo}
      remainingS={remainingS}
      warnAtS={warnAtS}
      phase={tournament.phase}
    />
  );
}

async function ConveningPanel({
  slug,
  tournamentId,
  me,
}: {
  slug: string;
  tournamentId: string;
  me: { id: string; role: string; ready: boolean } | null;
}) {
  const db = await getDb();
  const roster = await db
    .select()
    .from(participants)
    .where(and(eq(participants.tournamentId, tournamentId), eq(participants.role, "participant")));
  const readyCount = roster.filter((p) => p.ready).length;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-edge p-4">
      <div>
        <p className="font-semibold">Convening</p>
        <p className="text-sm text-muted">
          Read the drafts, find your first partner, sit next to them.{" "}
          {readyCount} of {roster.length} ready — the tournament begins when
          everyone is (or when the admin presses Begin).
        </p>
      </div>
      {me && me.role === "participant" && !me.ready && (
        <ControlButton action={readyAction.bind(null, slug)} label="I'm ready" />
      )}
      {me && me.role === "participant" && me.ready && (
        <span className="text-sm font-medium text-green-600">You&apos;re ready ✓</span>
      )}
    </div>
  );
}

async function GlobalChat({ slug, tournamentId, canPost }: { slug: string; tournamentId: string; canPost: boolean }) {
  const db = await getDb();
  const room = await globalRoom(db, tournamentId);
  if (!room) return null;
  const messages = await messagesFor(db, room.id);
  return <ChatPanel slug={slug} roomId={room.id} title="Tournament chat" messages={messages} canPost={canPost} />;
}
