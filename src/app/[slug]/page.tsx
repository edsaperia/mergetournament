import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { participants } from "../../db/schema";
import { globalRoom, messagesFor } from "../../services/chat-service";
import { readyAction } from "../../server/actions";
import { currentParticipant, tournamentBySlug } from "../../server/session";
import { AutoRefresh } from "../live";
import { ControlButton } from "./admin/admin-controls";
import { BracketView } from "./bracket-view";
import { ChatPanel } from "./chat-panel";

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
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">{tournament.name}</h1>
          <p className="mt-1 text-soft">
            {PHASE_LABEL[tournament.phase] ?? tournament.phase}
          </p>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          {me && (
            <span className="text-muted">
              {me.name}
              {me.role === "admin" ? " (admin)" : ""}
            </span>
          )}
          {me && tournament.phase === "submission" && (
            <Link className="rounded-lg bg-accent px-3 py-2 font-medium text-accent-ink" href={`/${slug}/submit`}>
              {me.role === "admin" ? "Submissions" : "Edit your draft"}
            </Link>
          )}
          {me?.role === "admin" && (
            <Link className="rounded-lg border border-line px-3 py-2 font-medium" href={`/${slug}/admin`}>
              Admin
            </Link>
          )}
        </nav>
      </div>

      {tournament.phase === "convening" && (
        <ConveningPanel slug={slug} tournamentId={tournament.id} me={me} />
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {tournament.phase === "submission" && (
            <p className="text-soft">
              Participants are writing their drafts. The bracket appears here
              when the admin publishes it.
            </p>
          )}
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
        <aside className="min-w-0">
          <GlobalChat slug={slug} tournamentId={tournament.id} canPost={Boolean(me)} />
        </aside>
      </div>
    </main>
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
