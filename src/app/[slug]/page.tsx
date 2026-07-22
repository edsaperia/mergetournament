import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { type Tournament } from "../../db/schema";
import { warnThresholds } from "../../lib/schedule";
import { globalRoom, messagesFor } from "../../services/chat-service";
import { readyAction, workspaceAction } from "../../server/actions";
import { mergesFor, rosterFor, scheduleContext, slotsFor } from "../../server/queries";
import { currentParticipant, tournamentBySlug } from "../../server/session";
import { AutoRefresh, RefreshAt } from "../live";
import { HowItWorks } from "./how-it-works";
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

      <IntroSection tournament={tournament} viewerRole={me?.role ?? null} />
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
                  readOnly={Boolean(tournament.submissionDeadline && new Date() > tournament.submissionDeadline)}
                />
              </div>
            ) : me?.role === "admin" ? (
              <AdminDashboard slug={slug} />
            ) : (
              <p className="text-soft">
                Participants are writing their drafts. The bracket appears here
                when the admin starts the tournament.
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

/**
 * The onboarding block: the admin's brief, the built-in explainer, and the
 * schedule as known. Prominent while submissions are open (a first-time
 * participant's landing view); tucked into a collapsible afterwards.
 */
function IntroSection({ tournament, viewerRole }: { tournament: Tournament; viewerRole: string | null }) {
  const intro = tournament.intro.trim();
  const preStart = tournament.phase === "setup" || tournament.phase === "submission";
  if (!intro && !preStart) return null;
  return (
    <section className="mb-6 flex flex-col gap-3">
      {intro && (
        <details open={preStart} className="rounded-md border border-edge px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">About this tournament</summary>
          <p className="mt-2 whitespace-pre-wrap text-soft">{intro}</p>
        </details>
      )}
      {preStart && (
        <>
          <HowItWorks open={viewerRole === "participant"} />
          {(tournament.publishAt || tournament.startAt) && (
            <p className="text-sm text-muted">
              {tournament.publishAt && (
                <>
                  The tournament starts <LocalTime iso={tournament.publishAt.toISOString()} />.
                </>
              )}
              {tournament.startAt && (
                <>
                  {" "}Round 1 opens <LocalTime iso={tournament.startAt.toISOString()} />.
                </>
              )}
            </p>
          )}
        </>
      )}
    </section>
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
  const { allRounds } = await scheduleContext(tournament);
  // Only relevant during a break: no round open/closing, a scheduled one next.
  if (allRounds.some((r) => r.state === "open" || r.state === "closing")) return null;
  const next = allRounds.find((r) => r.state === "scheduled");
  if (!next) return null;

  const nextSlotIds = new Set((await slotsFor(tournament.id)).filter((s) => s.roundNo === next.number).map((s) => s.id));
  const pending = (await mergesFor(tournament.id)).filter((m) => nextSlotIds.has(m.slotId) && m.state === "pending");
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
    const ctx = await scheduleContext(tournament);
    const open = ctx.allRounds.find((r) => r.state === "open");
    if (open) {
      roundNo = open.number;
      remainingS = ctx.remainingFor(open.number);
      const openSlotIds = new Set(
        (await slotsFor(tournament.id)).filter((s) => s.roundNo === open.number).map((s) => s.id)
      );
      const mine = (await mergesFor(tournament.id)).find(
        (m) =>
          openSlotIds.has(m.slotId) &&
          m.state === "open" &&
          (m.bearerAId === participantId || m.bearerBId === participantId)
      );
      myOpenMergeId = mine?.id ?? null;
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
  const roster = (await rosterFor(tournamentId)).filter((p) => p.role === "participant");
  const readyCount = roster.filter((p) => p.ready).length;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-edge p-4">
      <div>
        <p className="font-semibold">Convening</p>
        <p className="text-sm text-muted">
          Read the drafts, find your first partner, sit next to them.{" "}
          {readyCount} of {roster.length} ready — Round 1 opens when everyone
          is (or when the admin starts it).
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
