import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { merges, slots, textVersions } from "../../../../db/schema";
import { advancedFrom, resolutionSentence, whatNow } from "../../../../lib/resolution";
import { warnThresholds } from "../../../../lib/schedule";
import { mergesFor, nameMapFor, scheduleContext, slotsFor } from "../../../../server/queries";
import { signCollabToken } from "../../../../lib/collab-token";
import { docName } from "../../../../server/collab-core";
import { collabWsUrl } from "../../../../server/collab";
import { authSecret } from "../../../../server/config";
import { messagesFor, roomForMerge, roomForText } from "../../../../services/chat-service";
import { currentParticipant, tournamentBySlug } from "../../../../server/session";
import { AutoRefresh, Countdown } from "../../../live";
import { ChatPanel } from "../../chat-panel";
import { FlipAwareTabs, FlipReveal, HiddenWhileFlipping, ShownOnceLanded } from "../../flip-reveal";
import { NumberedText } from "../../../numbered-text";
import { CollabEditor } from "./collab-editor";
import { DecisionModal } from "./decision-modal";
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
  const isFinal = slot.roundNo === ctx.allRounds.length;

  const [textA] = m.textAId ? await db.select().from(textVersions).where(eq(textVersions.id, m.textAId)) : [];
  const [textB] = m.textBId ? await db.select().from(textVersions).where(eq(textVersions.id, m.textBId)) : [];
  const nameOf = await nameMapFor(tournament.id);

  const mySide = me && m.bearerAId === me.id ? "A" : me && m.bearerBId === me.id ? "B" : null;
  const paused = ctx.paused;
  const live = tournament.phase === "running" && round.state === "open" && m.state === "open";
  const canAct = Boolean(mySide) && live && !paused;
  // Keep listening through the decision-window, so the decision-modal sees
  // the partner's vote, the lock-in and the coin flip. The render that shows
  // the merge resolved drops the listener.
  const deciding = tournament.phase === "running" && round.state === "closing" && m.state === "open";

  const advanced = m.state === "resolved" ? advancedFrom(m) : null;
  // The candidate didn't advance: an input did instead, or nothing did.
  const candidateLost = m.state === "resolved" && advanced !== "merged";
  // Only animate flips that just happened; cold visitors see history.
  const flipAgeMs = m.resolvedAt ? new Date().getTime() - m.resolvedAt.getTime() : Infinity;
  const flipFresh = m.state === "resolved" && m.flipSeed !== null && flipAgeMs < 120_000;
  // While that coin is in the air, nothing may name its result: marks, tags and the opening tab wait for it.
  const flipKey = flipFresh ? m.id : null;
  const lock = m.state === "open" ? (m.proposedBy ? "proposed" : "editing") : "locked";
  const bearerName = (sideId: string | null) => nameOf.get(sideId ?? "") ?? "?";
  // If I went on and the next round has no partner for my text, it stands over there.
  let next: "standsOver" | "standsOverFinal" | null = null;
  if (me && m.state === "resolved" && m.advancingBearerId === me.id) {
    const withMerge = new Set((await mergesFor(tournament.id)).map((x) => x.slotId));
    const nextSlot = (await slotsFor(tournament.id)).find(
      (s) => s.roundNo === slot.roundNo + 1 && !withMerge.has(s.id) && s.outState === "filled" && s.outBearerId === me.id
    );
    if (nextSlot) next = nextSlot.roundNo === ctx.allRounds.length ? "standsOverFinal" : "standsOver";
  }

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
    <main
      // The tallest a text pane gets side by side (lg up), leaving the header and tabs in view.
      className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 [--pane-max-height:calc(100dvh-16rem)] sm:px-6"
    >
      {(live || deciding) && <AutoRefresh slug={slug} />}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">
          Round {slot.roundNo}
          {isFinal ? " (final)" : ""}
          {m.isAdHoc ? " (extra pairing)" : ""}: {bearerName(m.bearerAId)} + {bearerName(m.bearerBId)}
        </h1>
        {ctx.running && round.state === "open" && m.state === "open" && (
          <Countdown
            remainingS={ctx.remainingFor(slot.roundNo)}
            paused={paused}
            className="text-lg"
            {...warnThresholds(tournament.roundDurationS)}
          />
        )}
        {/* Decided: the clock no longer applies to this merge, only to the round around it. Greyed, never urgent. */}
        {ctx.running && round.state === "open" && m.state !== "open" && (
          <span className="text-sm text-faint">
            decided · round {slot.roundNo} closes within{" "}
            <Countdown remainingS={ctx.remainingFor(slot.roundNo)} paused={paused} />
          </span>
        )}
        {/* This merge's window only: once it resolves, the resolved banner says what happened. */}
        {ctx.running && round.state === "closing" && m.state === "open" && (
          <span className="text-lg text-warn">
            decision window <Countdown remainingS={ctx.decisionWindowRemaining(round)} paused={paused} />
          </span>
        )}
      </div>

      {m.state === "resolved" && (
        <div className="mb-4 rounded-md bg-panel px-3 py-2 text-sm">
          {(() => {
            const summary = (
              <span>
                {resolutionSentence(m, bearerName, isFinal)}
                {m.resultTextId && (
                  <>
                    {" · "}
                    <Link className="underline" href={`/${slug}/text/${m.resultTextId}`}>
                      {isFinal ? "read the final text" : "read the text"}
                    </Link>
                  </>
                )}
                {me && mySide && (
                  <span className="mt-1 block font-medium">{whatNow(m, me.id, bearerName, slot.roundNo, isFinal, tournament.phase === "complete", next)}</span>
                )}
              </span>
            );
            return flipFresh ? (
              <FlipReveal
                flipKey={m.id}
                a={m.resolution === "bearer_flip" ? bearerName(m.bearerAId) : `${bearerName(m.bearerAId)}'s input`}
                b={m.resolution === "bearer_flip" ? bearerName(m.bearerBId) : `${bearerName(m.bearerBId)}'s input`}
                title={
                  m.resolution === "bearer_flip"
                    ? `Deciding who goes into round ${slot.roundNo + 1}: ${bearerName(m.bearerAId)} or ${bearerName(m.bearerBId)}`
                    : `Time ran out — deciding which input text ${isFinal ? "becomes the final text" : "goes into the next round"}`
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

      <FlipAwareTabs
        // Remount on resolution, so a tab open during the flip also moves to what advanced.
        key={advanced ?? "open"}
        // Once resolved, open on what advanced: after a coin flip that is an
        // input, and the merge candidate is the text that lost. While the
        // coin is in the air, on the merge candidate, which gives nothing away.
        flipKey={flipKey}
        whileFlipping={1}
        defaultIndex={advanced === "A" ? 0 : advanced === "B" ? 2 : 1}
        // From lg up the merge sits beside an input: A | Merge or Merge | B.
        pinned={1}
        fill
        // Short on a phone, so the three tabs share one row at 360 px.
        labels={[
          <TabLabel key="a" short={`${bearerName(m.bearerAId)}'s input`} long={`Input A · ${bearerName(m.bearerAId)}`} mark={advanced === "A" ? " ✓" : ""} flipKey={flipKey} />,
          <TabLabel key="m" short="Merge" long="Merge candidate" mark={candidateLost ? " ✗" : ""} flipKey={flipKey} />,
          <TabLabel key="b" short={`${bearerName(m.bearerBId)}'s input`} long={`Input B · ${bearerName(m.bearerBId)}`} mark={advanced === "B" ? " ✓" : ""} flipKey={flipKey} />,
        ]}
      >
        <section className="grid gap-4">
          <div className="min-w-0 rounded-lg border border-edge p-4">
            <h2 className="mb-2 font-semibold">
              Input A · {bearerName(m.bearerAId)}
              {textA && <span className="ml-1 text-xs text-muted">({textA.wordCount}w)</span>}
              {advanced === "A" && <AdvancesTag isFinal={isFinal} flipKey={flipKey} />}
            </h2>
            {textA ? <InputText body={textA.bodyMd} /> : <p className="text-faint">—</p>}
          </div>
          <aside className="min-w-0">{await chatFor(roomA, "This text's chat")}</aside>
        </section>
        <section className="grid gap-4">
          <div
            className={`min-w-0 rounded-lg border-2 border-line p-4 ${
              // From lg up, while it is being written, the pane fits the screen with room for the
              // merge chat's header below: a long text scrolls inside the editor, and the picks
              // and Propose lock-in under it stay in view.
              m.state === "open" ? "lg:flex lg:max-h-[calc(100dvh-15rem)] lg:flex-col" : ""
            }`}
          >
            <h2 className="mb-2 font-semibold">
              Merge candidate
              {advanced === "merged" && <AdvancesTag isFinal={isFinal} flipKey={flipKey} />}
              {candidateLost && (
                <ShownOnceLanded flipKey={flipKey}>
                  <span className="ml-2 rounded bg-wash px-1.5 py-0.5 text-xs font-medium text-muted">
                    {isFinal ? "not the final text" : "doesn't go into the next round"}
                  </span>
                </ShownOnceLanded>
              )}
            </h2>
            {m.state === "resolved" ? (
              m.workingText ? (
                <InputText body={m.workingText} />
              ) : (
                <p className="text-faint">(blank)</p>
              )
            ) : (
              // From lg up the editor takes what the pane has left after the controls.
              <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:[--editor-min-height:10rem]">
                <CollabEditor
                  wsUrl={collabWsUrl()}
                  docName={docName(m.id)}
                  token={signCollabToken({ participantId: me?.id ?? "observer", mergeId: m.id }, authSecret())}
                  readOnly={!canAct || lock !== "editing"}
                  userName={me?.name ?? "observer"}
                />
              </div>
            )}
            {canAct && mySide && (
              <WorkspaceControls
                slug={slug}
                mergeId={m.id}
                mySide={mySide}
                names={{ A: bearerName(m.bearerAId), B: bearerName(m.bearerBId) }}
                lock={lock === "locked" ? "editing" : (lock as "editing" | "proposed")}
                proposedBy={m.proposedBy}
                myPref={mySide === "A" ? m.bearerPrefA : m.bearerPrefB}
                partnerPref={mySide === "A" ? m.bearerPrefB : m.bearerPrefA}
                iAmActive={mySide === "A" ? m.activeA : m.activeB}
                partnerActive={mySide === "A" ? m.activeB : m.activeA}
                finalRound={isFinal}
              />
            )}
            {!mySide && m.state === "open" && (
              <p className="mt-3 text-xs text-muted">
                Only this merge&apos;s two players hold the pen — you are watching
                live. Lobbying arrives through the chat below.
              </p>
            )}
          </div>
          <aside className="min-w-0">
            {/* Its system message names the flip's result; side by side this chat stays in view. */}
            <HiddenWhileFlipping flipKey={flipKey}>
              {await chatFor(mergeRoom, "This merge's chat")}
            </HiddenWhileFlipping>
          </aside>
        </section>
        <section className="grid gap-4">
          <div className="min-w-0 rounded-lg border border-edge p-4">
            <h2 className="mb-2 font-semibold">
              Input B · {bearerName(m.bearerBId)}
              {textB && <span className="ml-1 text-xs text-muted">({textB.wordCount}w)</span>}
              {advanced === "B" && <AdvancesTag isFinal={isFinal} flipKey={flipKey} />}
            </h2>
            {textB ? <InputText body={textB.bodyMd} /> : <p className="text-faint">—</p>}
          </div>
          <aside className="min-w-0">{await chatFor(roomB, "This text's chat")}</aside>
        </section>
      </FlipAwareTabs>
      {/* Outside the tabs, so no tab choice can hide it: it covers the whole page. */}
      {round.state === "closing" && m.state === "open" && mySide && !paused && (
        <DecisionModal
          slug={slug}
          mergeId={m.id}
          mySide={mySide}
          names={{ A: bearerName(m.bearerAId), B: bearerName(m.bearerBId) }}
          proposedBy={m.proposedBy}
          myVote={mySide === "A" ? m.activeChoiceA : m.activeChoiceB}
          partnerVote={mySide === "A" ? m.activeChoiceB : m.activeChoiceA}
          myPref={mySide === "A" ? m.bearerPrefA : m.bearerPrefB}
          partnerPref={mySide === "A" ? m.bearerPrefB : m.bearerPrefA}
          iAmActive={mySide === "A" ? m.activeA : m.activeB}
          partnerActive={mySide === "A" ? m.activeB : m.activeA}
          finalRound={isFinal}
          workingText={m.workingText}
          remainingS={ctx.decisionWindowRemaining(round)}
        />
      )}
    </main>
  );
}

/** A read-only text, capped in height from lg up so the pane beside it stays in view. */
function InputText({ body }: { body: string }) {
  return (
    <div className="lg:max-h-(--pane-max-height) lg:overflow-y-auto">
      <NumberedText body={body} />
    </div>
  );
}

function TabLabel({ short, long, mark, flipKey }: { short: string; long: string; mark: string; flipKey: string | null }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{long}</span>
      {mark && <ShownOnceLanded flipKey={flipKey}>{mark}</ShownOnceLanded>}
    </>
  );
}

/** The tag on the text that goes on; held back while a coin that decided it is in the air. */
function AdvancesTag({ isFinal, flipKey }: { isFinal: boolean; flipKey: string | null }) {
  return (
    <ShownOnceLanded flipKey={flipKey}>
      <span className="ml-2 rounded bg-ok-surface px-1.5 py-0.5 text-xs font-medium text-ok">
        {isFinal ? "the final text" : "goes into the next round"}
      </span>
    </ShownOnceLanded>
  );
}
