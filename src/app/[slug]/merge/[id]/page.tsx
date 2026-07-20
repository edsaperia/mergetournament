import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { merges, participants, rounds, slots, textVersions } from "../../../../db/schema";
import { roundRemainingS } from "../../../../lib/schedule";
import { effectiveT, GRACE_S } from "../../../../services/runtime-service";
import { signCollabToken } from "../../../../lib/collab-token";
import { docName } from "../../../../server/collab-core";
import { collabWsUrl } from "../../../../server/collab";
import { authSecret } from "../../../../server/config";
import { messagesFor, roomForMerge, roomForText } from "../../../../services/chat-service";
import { currentParticipant, tournamentBySlug } from "../../../../server/session";
import { AutoRefresh, Countdown } from "../../../live";
import { ChatPanel } from "../../chat-panel";
import { CollabEditor } from "./collab-editor";
import { WindowControls } from "./window-controls";
import { WorkspaceControls } from "./workspace-controls";

export default async function MergePage(props: PageProps<"/[slug]/merge/[id]">) {
  const { slug, id } = await props.params;
  const tournament = await tournamentBySlug(slug);
  if (!tournament) notFound();
  const me = await currentParticipant(slug);
  if (tournament.visibility === "participants_only" && !me) notFound();

  const db = await getDb();
  const [m] = await db.select().from(merges).where(eq(merges.id, id));
  if (!m) notFound();
  const [slot] = await db.select().from(slots).where(eq(slots.id, m.slotId));
  if (slot.tournamentId !== tournament.id) notFound();
  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.tournamentId, tournament.id), eq(rounds.number, slot.roundNo)));

  const [textA] = m.textAId ? await db.select().from(textVersions).where(eq(textVersions.id, m.textAId)) : [];
  const [textB] = m.textBId ? await db.select().from(textVersions).where(eq(textVersions.id, m.textBId)) : [];
  const roster = await db.select().from(participants).where(eq(participants.tournamentId, tournament.id));
  const nameOf = new Map(roster.map((p) => [p.id, p.name]));

  const mySide = me && m.bearerAId === me.id ? "A" : me && m.bearerBId === me.id ? "B" : null;
  const paused = Boolean(tournament.pausedAt);
  const live = tournament.phase === "running" && round.state === "open" && m.state === "open";
  const canAct = Boolean(mySide) && live && !paused;

  const allRounds = await db.select().from(rounds).where(eq(rounds.tournamentId, tournament.id));
  const config = {
    numRounds: allRounds.length,
    roundDurationS: tournament.roundDurationS,
    breakDurationS: tournament.breakDurationS,
  };
  const progress = allRounds
    .sort((a, b) => a.number - b.number)
    .map((r) => ({ actualStart: r.actualStartS ?? undefined, actualClose: r.actualCloseS ?? undefined }));

  const lock = m.state === "open" ? (m.proposedBy ? "proposed" : "editing") : "locked";
  const bearerName = (sideId: string | null) => nameOf.get(sideId ?? "") ?? "?";

  // Chats: the merge's own room, and each input's room (a draft's chat, or
  // the chat of the merge that produced it — discussion travels with texts).
  const canChat = Boolean(me) && me!.role !== "admin";
  const mergeRoom = await roomForMerge(db, m.id);
  const roomA = m.textAId ? await roomForText(db, m.textAId) : null;
  const roomB = m.textBId ? await roomForText(db, m.textBId) : null;
  const chatFor = async (room: { id: string } | null, title: string, defaultOpen: boolean) =>
    room ? (
      <ChatPanel
        slug={slug}
        roomId={room.id}
        title={title}
        messages={await messagesFor(db, room.id)}
        canPost={canChat}
        defaultOpen={defaultOpen}
      />
    ) : null;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      {live && <AutoRefresh slug={slug} />}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">
          <Link className="hover:underline" href={`/${slug}`}>{tournament.name}</Link>
          {" — round "}{slot.roundNo}{m.isAdHoc ? " (ad-hoc)" : ""}: {bearerName(m.bearerAId)} + {bearerName(m.bearerBId)}
        </h1>
        {tournament.phase === "running" && tournament.begunAt && round.state === "open" && (
          <Countdown
            remainingS={roundRemainingS(config, progress, slot.roundNo, effectiveT(tournament, new Date()))}
            paused={paused}
            className="text-lg"
          />
        )}
        {tournament.phase === "running" && tournament.begunAt && round.state === "closing" && (
          <span className="text-lg text-amber-600">
            backstop{" "}
            <Countdown
              remainingS={(round.actualStartS ?? 0) + tournament.roundDurationS + GRACE_S - effectiveT(tournament, new Date())}
              paused={paused}
            />
          </span>
        )}
      </div>

      {paused && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Tournament paused by the admin.
        </p>
      )}
      {m.state === "resolved" && (
        <p className="mb-4 rounded-md bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-900">
          Resolved ({m.resolution?.replace("_", " ")})
          {m.resultTextId && (
            <>
              {" · "}
              <Link className="underline" href={`/${slug}/text/${m.resultTextId}`}>
                see the advancing text
              </Link>
            </>
          )}
          {" · carried by "}{bearerName(m.advancingBearerId)}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-2 font-semibold">
            Input A · {bearerName(m.bearerAId)}
            {textA && <span className="ml-1 text-xs text-neutral-500">({textA.wordCount}w)</span>}
          </h2>
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">{textA?.bodyMd ?? "—"}</pre>
          <div className="mt-3">{await chatFor(roomA, "This text's chat", false)}</div>
        </section>
        <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-2 font-semibold">
            Input B · {bearerName(m.bearerBId)}
            {textB && <span className="ml-1 text-xs text-neutral-500">({textB.wordCount}w)</span>}
          </h2>
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">{textB?.bodyMd ?? "—"}</pre>
          <div className="mt-3">{await chatFor(roomB, "This text's chat", false)}</div>
        </section>
        <section className="rounded-lg border-2 border-neutral-300 p-4 dark:border-neutral-700">
          <h2 className="mb-2 font-semibold">Merge candidate</h2>
          {m.state === "resolved" ? (
            <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
              {m.workingText || "(blank)"}
            </pre>
          ) : (
            <CollabEditor
              wsUrl={collabWsUrl()}
              docName={docName(m.id)}
              token={signCollabToken({ participantId: me?.id ?? "observer", mergeId: m.id }, authSecret())}
              readOnly={!canAct || lock !== "editing"}
              userName={me?.name ?? "observer"}
            />
          )}
          {round.state === "closing" && m.state === "open" && mySide && !paused && (
            <WindowControls
              slug={slug}
              mergeId={m.id}
              iAmActive={mySide === "A" ? m.activeA : m.activeB}
              myChoice={mySide === "A" ? m.activeChoiceA : m.activeChoiceB}
              partnerName={bearerName(mySide === "A" ? m.bearerBId : m.bearerAId)}
            />
          )}
          {canAct && mySide && (
            <WorkspaceControls
              slug={slug}
              mergeId={m.id}
              mySide={mySide}
              partnerName={bearerName(mySide === "A" ? m.bearerBId : m.bearerAId)}
              lock={lock === "locked" ? "editing" : (lock as "editing" | "proposed")}
              proposedBy={m.proposedBy}
              myPref={mySide === "A" ? m.bearerPrefA : m.bearerPrefB}
            />
          )}
          {!mySide && m.state === "open" && (
            <p className="mt-3 text-xs text-neutral-500">
              Only this merge&apos;s bearers hold the pen — you are watching
              live. Lobbying arrives through the chat below.
            </p>
          )}
          <div className="mt-3">{await chatFor(mergeRoom, "This merge's chat", true)}</div>
        </section>
      </div>
    </main>
  );
}
