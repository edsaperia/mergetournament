import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { textVersions, type Tournament } from "../../db/schema";
import { projectedStarts, wallClockIso, warnThresholds } from "../../lib/schedule";
import { mergesFor, nameMapFor, scheduleContext, slotsFor } from "../../server/queries";
import { FlipReveal } from "./flip-reveal";
import { Countdown } from "../live";
import { LocalTime } from "../local-time";

const RESOLUTION_LABEL: Record<string, string> = {
  agreed: "agreed",
  bearer_flip: "agreed · bearer by flip",
  backstop_flip: "clock ran out · coin flip",
  active_advance: "one bearer present",
  abandoned: "abandoned",
  walkover: "walkover",
};

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

  const starts = allRounds.length > 0 ? projectedStarts(config, progress) : [];

  const wallIso = (s: number) => wallClockIso(tournament, s);

  const TimeSpan = ({ fromS, toS }: { fromS: number; toS: number }) => {
    const dur = `${Math.round((toS - fromS) / 60)}m`;
    const from = wallIso(fromS);
    const to = wallIso(toS);
    return from && to ? (
      <>
        <LocalTime iso={from} timeOnly /> – <LocalTime iso={to} timeOnly /> ({dur})
      </>
    ) : (
      <>
        +{Math.round(fromS / 60)}m – +{Math.round(toS / 60)}m ({dur})
      </>
    );
  };

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
          const roundStart = round.actualStartS ?? starts[round.number - 1] ?? round.scheduledStartS;
          const roundEnd = round.actualCloseS ?? roundStart + tournament.roundDurationS;
          const breakStart = roundStart - tournament.breakDurationS;
          return (
            <section key={round.number}>
              {round.number > 1 && (
                <div className="mb-3">
                  <header className="mb-1 flex items-baseline justify-between">
                    <h3 className="font-semibold text-muted">Break</h3>
                    <span className="text-xs text-muted">
                      <TimeSpan fromS={breakStart} toS={roundStart} />
                    </span>
                  </header>
                  <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-line px-3 py-1.5 text-sm text-muted">
                    {inThisBreak && prev?.actualCloseS != null ? (
                      <>
                        back in{" "}
                        <Countdown
                          remainingS={prev.actualCloseS + tournament.breakDurationS - te}
                          paused={paused}
                        />
                      </>
                    ) : (
                      <>read, lobby, find your next partner</>
                    )}
                  </div>
                </div>
              )}
              <header className="mb-2 flex items-baseline justify-between">
                <h3 className="font-semibold">
                  Round {round.number}
                  <span className="ml-2 text-xs font-normal text-muted">
                    <TimeSpan fromS={roundStart} toS={roundEnd} />
                  </span>
                </h3>
                <span className="text-xs text-muted">
                  {round.state === "open" && running && (
                    <Countdown
                      remainingS={ctx.remainingFor(round.number)}
                      paused={paused}
                      {...warnThresholds(tournament.roundDurationS)}
                    />
                  )}
                  {round.state === "closing" && running && (
                    <span className="text-warn">
                      backstop <Countdown remainingS={ctx.backstopRemaining(round)} paused={paused} />
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
                    return (
                      <div key={slot.id} className="w-64 rounded-lg border border-dashed border-line p-3 text-sm text-muted">
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
                                  ? `Deciding between ${nameOf.get(m.bearerAId ?? "") ?? "?"} and ${nameOf.get(m.bearerBId ?? "") ?? "?"} to carry this merge into round ${slot.roundNo + 1}`
                                  : `Round ${slot.roundNo}: time ran out — deciding which text advances`
                              }
                              winner={
                                m.resolution === "bearer_flip"
                                  ? nameOf.get(m.advancingBearerId ?? "") ?? "?"
                                  : title(m.resultTextId)
                              }
                            >
                              <span className="text-muted">
                                {RESOLUTION_LABEL[m.resolution ?? ""] ?? m.resolution}
                              </span>
                            </FlipReveal>
                          ) : (
                            <span className="text-muted">{RESOLUTION_LABEL[m.resolution ?? ""] ?? m.resolution}</span>
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
