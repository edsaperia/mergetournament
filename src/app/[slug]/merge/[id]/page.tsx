import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { merges, slots, textVersions } from "../../../../db/schema";
import { warnThresholds } from "../../../../lib/schedule";
import { nameMapFor, scheduleContext } from "../../../../server/queries";
import { signCollabToken } from "../../../../lib/collab-token";
import { docName } from "../../../../server/collab-core";
import { collabWsUrl } from "../../../../server/collab";
import { authSecret } from "../../../../server/config";
import { messagesFor, roomForMerge, roomForText } from "../../../../services/chat-service";
import { currentParticipant, tournamentBySlug } from "../../../../server/session";
import { AutoRefresh, Countdown } from "../../../live";
import { ChatPanel } from "../../chat-panel";
import { FlipReveal } from "../../flip-reveal";
import { NumberedText } from "../../../numbered-text";
import { Tabs } from "../../tabs";
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

  const ctx = await scheduleContext(tournament);
  const round = ctx.allRounds.find((r) => r.number === slot.roundNo);
  if (!round) notFound();

  const [textA] = m.textAId ? await db.select().from(textVersions).where(eq(textVersions.id, m.textAId)) : [];
  const [textB] = m.textBId ? await db.select().from(textVersions).where(eq(textVersions.id, m.textBId)) : [];
  const nameOf = await nameMapFor(tournament.id);

  const mySide = me && m.bearerAId === me.id ? "A" : me && m.bearerBId === me.id ? "B" : null;
  const paused = ctx.paused;
  const live = tournament.phase === "running" && round.state === "open" && m.state === "open";
  const canAct = Boolean(mySide) && live && !paused;

  const lock = m.state === "open" ? (m.proposedBy ? "proposed" : "editing") : "locked";
  const bearerName = (sideId: string | null) => nameOf.get(sideId ?? "") ?? "?";

  // Chats: the merge's own room, and each input's room (a draft's chat, or
  // the chat of the merge that produced it — discussion travels with texts).
  const canChat = Boolean(me) && me!.role !== "admin";
  const mergeRoom = await roomForMerge(db, m.id);
  const roomA = m.textAId ? await roomForText(db, m.textAId) : null;
  const roomB = m.textBId ? await roomForText(db, m.textBId) : null;
  const chatNote = !me
    ? "Sign in with your invitation link to chat."
    : me.role === "admin"
      ? "The admin reads everything but posts only in the tournament chat."
      : undefined;
  const chatFor = async (room: { id: string } | null, title: string, defaultOpen = true) =>
    room ? (
      <ChatPanel
        slug={slug}
        roomId={room.id}
        title={title}
        messages={await messagesFor(db, room.id)}
        canPost={canChat}
        readOnlyNote={chatNote}
        defaultOpen={defaultOpen}
      />
    ) : null;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      {live && <AutoRefresh slug={slug} />}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">
          Round {slot.roundNo}
          {m.isAdHoc ? " (ad-hoc)" : ""}: {bearerName(m.bearerAId)} + {bearerName(m.bearerBId)}
        </h1>
        {ctx.running && round.state === "open" && (
          <Countdown
            remainingS={ctx.remainingFor(slot.roundNo)}
            paused={paused}
            className="text-lg"
            {...warnThresholds(tournament.roundDurationS)}
          />
        )}
        {ctx.running && round.state === "closing" && (
          <span className="text-lg text-amber-600">
            backstop <Countdown remainingS={ctx.backstopRemaining(round)} paused={paused} />
          </span>
        )}
      </div>

      {m.state === "resolved" && (
        <div className="mb-4 rounded-md bg-panel px-3 py-2 text-sm">
          {(() => {
            const summary = (
              <span>
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
              </span>
            );
            // Only animate flips that just happened; cold visitors see history.
            const flipAgeMs = m.resolvedAt ? new Date().getTime() - m.resolvedAt.getTime() : Infinity;
            return m.flipSeed !== null && flipAgeMs < 120_000 ? (
              <FlipReveal
                flipKey={m.id}
                a={m.resolution === "bearer_flip" ? bearerName(m.bearerAId) : `${bearerName(m.bearerAId)}'s input`}
                b={m.resolution === "bearer_flip" ? bearerName(m.bearerBId) : `${bearerName(m.bearerBId)}'s input`}
                title={
                  m.resolution === "bearer_flip"
                    ? `Deciding between ${bearerName(m.bearerAId)} and ${bearerName(m.bearerBId)} to carry this merge into round ${slot.roundNo + 1}`
                    : "Time ran out — deciding which input text advances"
                }
                winner={
                  m.resolution === "bearer_flip"
                    ? bearerName(m.advancingBearerId)
                    : `${bearerName(m.advancingBearerId)}'s input`
                }
              >
                {summary}
              </FlipReveal>
            ) : (
              summary
            );
          })()}
        </div>
      )}

      <Tabs
        defaultIndex={2}
        labels={[
          `Input A · ${bearerName(m.bearerAId)}`,
          `Input B · ${bearerName(m.bearerBId)}`,
          "Merge candidate",
        ]}
      >
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 rounded-lg border border-edge p-4">
            <h2 className="mb-2 font-semibold">
              Input A · {bearerName(m.bearerAId)}
              {textA && <span className="ml-1 text-xs text-muted">({textA.wordCount}w)</span>}
            </h2>
            {textA ? <NumberedText body={textA.bodyMd} /> : <p className="text-faint">—</p>}
          </div>
          <aside className="min-w-0">{await chatFor(roomA, "This text's chat")}</aside>
        </section>
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 rounded-lg border border-edge p-4">
            <h2 className="mb-2 font-semibold">
              Input B · {bearerName(m.bearerBId)}
              {textB && <span className="ml-1 text-xs text-muted">({textB.wordCount}w)</span>}
            </h2>
            {textB ? <NumberedText body={textB.bodyMd} /> : <p className="text-faint">—</p>}
          </div>
          <aside className="min-w-0">{await chatFor(roomB, "This text's chat")}</aside>
        </section>
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 rounded-lg border-2 border-line p-4">
            <h2 className="mb-2 font-semibold">Merge candidate</h2>
          {m.state === "resolved" ? (
            m.workingText ? (
              <NumberedText body={m.workingText} />
            ) : (
              <p className="text-faint">(blank)</p>
            )
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
              <p className="mt-3 text-xs text-muted">
                Only this merge&apos;s bearers hold the pen — you are watching
                live. Lobbying arrives through the chat on the right.
              </p>
            )}
          </div>
          <aside className="min-w-0">{await chatFor(mergeRoom, "This merge's chat")}</aside>
        </section>
      </Tabs>
    </main>
  );
}
