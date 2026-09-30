import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { textVersions, type Tournament } from "../../db/schema";
import { resolutionLabel } from "../../lib/resolution";
import {
  DECISION_WINDOW_S,
  earliestStarts,
  fmtDuration,
  projectedEnd,
  projectedStarts,
  wallClockIso,
  warnThresholds,
} from "../../lib/schedule";
import { mergesFor, nameMapFor, scheduleContext, slotsFor } from "../../server/queries";
import { FlipReveal } from "./flip-reveal";
import { Countdown } from "../live";
import { LocalTime } from "../local-time";


export async function BracketView({
  tournament,
  viewerId,
}: {
  tournament: Tournament;
  viewerId: string | null;
}) {
  const db = await getDb();
  const ctx = await scheduleContext(tournament);
  const { allRounds, config, progress, running, paused, te } = ctx;
  const allSlots = await slotsFor(tournament.id);
  const allMerges = await mergesFor(tournament.id);
  const nameOf = await nameMapFor(tournament.id);
  const texts = await db
    .select({ id: textVersions.id, kind: textVersions.kind, wordCount: textVersions.wordCount, authorId: textVersions.authorId })
    .from(textVersions)
    .where(eq(textVersions.tournamentId, tournament.id));

  const textById = new Map(texts.map((t) => [t.id, t]));
  const mergeBySlot = new Map(allMerges.map((m) => [m.slotId, m]));

  const title = (textId: string | null): string => {
    if (!textId) return "—";
    const t = textById.get(textId);
    if (!t) return "text";
    return t.kind === "draft" ? `${nameOf.get(t.authorId ?? "") ?? "?"}'s draft` : `merged text (${t.wordCount}w)`;
  };

  // A round is shown starting at the earliest it can open (its printed time,
  // which leaves out decision-windows), noting how much later it could be
  // if earlier rounds use theirs; ends and totals are the latest case.
  const starts = allRounds.length > 0 ? projectedStarts(config, progress) : [];
  const earliest = allRounds.length > 0 ? earliestStarts(config, progress) : [];

  // Clock times once Round 1 has a start (begun, or scheduled while
  // convening); before that, only lengths are known.
  const wallIso = (s: number): string | null =>
    wallClockIso(tournament, s) ??
    (tournament.startAt ? new Date(tournament.startAt.getTime() + s * 1000).toISOString() : null);

  const TimeSpan = ({ fromS, toS, length, slipS = 0 }: { fromS: number; toS: number; length: string; slipS?: number }) => {
    const from = wallIso(fromS);
    const to = wallIso(toS);
    return from && to ? (
      <>
        <LocalTime iso={from} timeOnly />
        {slipS > 0 && <> (or up to {fmtDuration(slipS)} later)</>} – <LocalTime iso={to} timeOnly />
      </>
    ) : (
      <>{length}</>
    );
  };
  const roundLength = `${fmtDuration(tournament.roundDurationS)} + up to ${fmtDuration(DECISION_WINDOW_S)} to decide`;

  return (
    <div>
      {running && (
        <p className="mb-4 text-sm text-muted">
          Total remaining:{" "}
          <Countdown remainingS={ctx.globalRemaining()} paused={paused} className="text-base" />
        </p>
      )}
      <div className="flex flex-col gap-3 pb-4">
        {allRounds.map((round) => {
          const roundSlots = allSlots.filter((s) => s.roundNo === round.number);
          const prev = allRounds[round.number - 2];
          const inThisBreak =
            running && !paused && round.state === "scheduled" && prev?.state === "closed";
          const roundStart = round.actualStartS ?? earliest[round.number - 1] ?? round.scheduledStartS;
          const slipS = round.actualStartS == null ? (starts[round.number - 1] ?? roundStart) - roundStart : 0;
          // At the latest: unfinished pairs get the decision-window after the clock.
          const roundEnd = projectedEnd(config, progress, starts, round.number);
          return (
            <section key={round.number}>
              {round.number > 1 && (
                <div className="mb-3">
                  <header className="mb-1 flex items-baseline justify-between">
                    <h3 className="font-semibold text-muted">Break</h3>
                    <span className="text-xs text-muted">
                      {/* Clock times once the round before has closed; until then only its length is certain. */}
                      {prev?.actualCloseS != null ? (
                        <TimeSpan fromS={prev.actualCloseS} toS={roundStart} length={fmtDuration(tournament.breakDurationS)} />
                      ) : (
                        fmtDuration(tournament.breakDurationS)
                      )}
                    </span>
                  </header>
                  <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-line px-3 py-1.5 text-sm text-muted">
                    {inThisBreak && prev?.actualCloseS != null ? (
                      <>
                        back in{" "}
                        <Countdown
                          remainingS={roundStart - te}
                          paused={paused}
                        />
                      </>
                    ) : round.state === "scheduled" ? (
                      <>read, lobby, find your next partner</>
                    ) : (
                      // Behind us (and after the end): nothing left to do in it.
                      <>break over</>
                    )}
                  </div>
                </div>
              )}
              <header className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="min-w-0 font-semibold">
                  Round {round.number}
                  {/* Wraps as a unit under the heading on a phone, never splitting "PM" off. */}
                  <span className="ml-2 inline-block text-xs font-normal text-muted">
                    <TimeSpan fromS={roundStart} toS={roundEnd} length={roundLength} slipS={slipS} />
                  </span>
                </h3>
                <span className="shrink-0 text-xs text-muted">
                  {round.state === "open" && running && (
                    <Countdown
                      remainingS={ctx.remainingFor(round.number)}
                      paused={paused}
                      {...warnThresholds(tournament.roundDurationS)}
                    />
                  )}
                  {round.state === "closing" && running && (
                    <span className="text-warn">
                      decision window <Countdown remainingS={ctx.decisionWindowRemaining(round)} paused={paused} />
                    </span>
                  )}
                  {round.state === "closed" && "closed"}
                  {round.state === "scheduled" && "upcoming"}
                </span>
              </header>
              <div className="flex flex-wrap gap-2">
                {roundSlots.map((slot) => {
                  const m = mergeBySlot.get(slot.id);
                  if (!m) {
                    // The viewer's own bye, or their text standing over: marked like "you are here".
                    const mine = viewerId !== null && slot.outState === "filled" && slot.outBearerId === viewerId;
                    return (
                      <div
                        key={slot.id}
                        className={`w-64 rounded-lg border border-dashed p-3 text-sm text-muted ${mine ? "border-live" : "border-line"}`}
                      >
                        {slot.kind === "bye" ? (
                          slot.outTextId ? (
                            <>
                              bye ·{" "}
                              <Link className="underline" href={`/${tournament.slug}/text/${slot.outTextId}`}>
                                {title(slot.outTextId)}
                              </Link>
                            </>
                          ) : (
                            "bye"
                          )
                        ) : slot.outState === "filled" && slot.outTextId ? (
                          <>
                            stands over ·{" "}
                            <Link className="underline" href={`/${tournament.slug}/text/${slot.outTextId}`}>
                              {title(slot.outTextId)}
                            </Link>
                          </>
                        ) : slot.outState === "empty" ? (
                          "—"
                        ) : (
                          "…"
                        )}
                        {mine && <span className="ml-1 text-xs text-live-ink">yours</span>}
                      </div>
                    );
                  }
                  // "You are here" points at where you should be NOW — never
                  // at resolved merges you've already carried forward from.
                  const involved = viewerId !== null && (m.bearerAId === viewerId || m.bearerBId === viewerId);
                  const here = involved && m.state === "open";
                  const upNext = involved && m.state === "pending";
                  return (
                    <Link
                      key={slot.id}
                      href={`/${tournament.slug}/merge/${m.id}`}
                      className={`block w-64 rounded-lg border p-3 text-sm hover:border-strong ${
                        here ? "border-live ring-1 ring-live" : upNext ? "border-live" : "border-line"
                      }`}
                    >
                      <p className="font-medium">
                        {nameOf.get(m.bearerAId ?? "") ?? "?"} + {nameOf.get(m.bearerBId ?? "") ?? "?"}
                        {m.isAdHoc && <span className="ml-1 text-xs text-muted">(ad-hoc)</span>}
                        {here && <span className="ml-1 text-xs text-live-ink">you are here</span>}
                        {upNext && <span className="ml-1 text-xs text-live-ink">you, up next</span>}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {title(m.textAId)} + {title(m.textBId)}
                      </p>
                      <p className="mt-1 text-xs">
                        {m.state === "resolved" ? (
                          m.flipSeed !== null &&
                          m.resolvedAt &&
                          Date.now() - m.resolvedAt.getTime() < 120_000 ? (
                            <FlipReveal
                              flipKey={m.id}
                              a={m.resolution === "bearer_flip" ? nameOf.get(m.bearerAId ?? "") ?? "?" : title(m.textAId)}
                              b={m.resolution === "bearer_flip" ? nameOf.get(m.bearerBId ?? "") ?? "?" : title(m.textBId)}
                              title={
                                m.resolution === "bearer_flip"
                                  ? `Deciding who goes into round ${slot.roundNo + 1}: ${nameOf.get(m.bearerAId ?? "") ?? "?"} or ${nameOf.get(m.bearerBId ?? "") ?? "?"}`
                                  : `Round ${slot.roundNo}: time ran out — deciding which text ${slot.roundNo === allRounds.length ? "becomes the final text" : "goes into the next round"}`
                              }
                              winner={
                                m.resolution === "bearer_flip"
                                  ? nameOf.get(m.advancingBearerId ?? "") ?? "?"
                                  : title(m.resultTextId)
                              }
                            >
                              <span className="text-muted">
                                {resolutionLabel(m.resolution)}
                              </span>
                            </FlipReveal>
                          ) : (
                            <span className="text-muted">{resolutionLabel(m.resolution)}</span>
                          )
                        ) : m.state === "open" ? (
                          <span className="text-ok">negotiating</span>
                        ) : (
                          <span className="text-faint">{m.state}</span>
                        )}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {tournament.phase === "complete" && <CanonicalBanner tournament={tournament} roundsCount={allRounds.length} />}
    </div>
  );
}

async function CanonicalBanner({ tournament, roundsCount }: { tournament: Tournament; roundsCount: number }) {
  const [finalSlot] = (await slotsFor(tournament.id)).filter((s) => s.roundNo === roundsCount);
  if (finalSlot?.outState !== "filled" || !finalSlot.outTextId) {
    return (
      <div className="mt-6">
        <h2 className="mb-2 text-2xl font-bold">Merge Tournament Over!</h2>
        <p className="rounded-lg border border-line p-4">
          The tournament concluded with no canonical text.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-2xl font-bold">Merge Tournament Over!</h2>
      <p className="rounded-lg border-2 border-ok p-4 text-lg">
        🏆 The canonical text has emerged:{" "}
        <Link className="font-semibold underline" href={`/${tournament.slug}/text`}>
          read it
        </Link>
      </p>
    </div>
  );
}
