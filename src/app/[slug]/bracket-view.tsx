import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { merges, participants, rounds, slots, textVersions, type Tournament } from "../../db/schema";
import { globalRemainingS, roundRemainingS, warnThresholds, type RoundProgress } from "../../lib/schedule";
import { effectiveT, GRACE_S } from "../../services/runtime-service";
import { FlipReveal } from "./flip-reveal";
import { Countdown } from "../live";

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
  const allRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, tournament.id))
    .orderBy(asc(rounds.number));
  const allSlots = await db
    .select()
    .from(slots)
    .where(eq(slots.tournamentId, tournament.id))
    .orderBy(asc(slots.roundNo), asc(slots.position));
  const slotIds = allSlots.map((s) => s.id);
  const allMerges = slotIds.length ? await db.select().from(merges).where(inArray(merges.slotId, slotIds)) : [];
  const roster = await db.select().from(participants).where(eq(participants.tournamentId, tournament.id));
  const texts = await db
    .select({ id: textVersions.id, kind: textVersions.kind, wordCount: textVersions.wordCount, authorId: textVersions.authorId })
    .from(textVersions)
    .where(eq(textVersions.tournamentId, tournament.id));

  const nameOf = new Map(roster.map((p) => [p.id, p.name]));
  const textById = new Map(texts.map((t) => [t.id, t]));
  const mergeBySlot = new Map(allMerges.map((m) => [m.slotId, m]));

  const title = (textId: string | null): string => {
    if (!textId) return "—";
    const t = textById.get(textId);
    if (!t) return "text";
    return t.kind === "draft" ? `${nameOf.get(t.authorId ?? "") ?? "?"}'s draft` : `merged text (${t.wordCount}w)`;
  };

  const running = tournament.phase === "running" && tournament.begunAt;
  const te = running ? effectiveT(tournament, new Date()) : 0;
  const config = {
    numRounds: allRounds.length,
    roundDurationS: tournament.roundDurationS,
    breakDurationS: tournament.breakDurationS,
  };
  const progress: RoundProgress[] = allRounds.map((r) => ({
    actualStart: r.actualStartS ?? undefined,
    actualClose: r.actualCloseS ?? undefined,
  }));
  const paused = Boolean(tournament.pausedAt);

  return (
    <div>
      {running && tournament.phase === "running" && (
        <p className="mb-4 text-sm text-muted">
          Total remaining:{" "}
          <Countdown remainingS={globalRemainingS(config, progress, te)} paused={paused} className="text-base" />
        </p>
      )}
      {paused && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Tournament paused by the admin.
        </p>
      )}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {allRounds.map((round) => {
          const roundSlots = allSlots.filter((s) => s.roundNo === round.number);
          return (
            <section key={round.number} className="min-w-56 flex-1">
              <header className="mb-2 flex items-baseline justify-between">
                <h3 className="font-semibold">Round {round.number}</h3>
                <span className="text-xs text-muted">
                  {round.state === "open" && running && (
                    <Countdown
                      remainingS={roundRemainingS(config, progress, round.number, te)}
                      paused={paused}
                      {...warnThresholds(tournament.roundDurationS)}
                    />
                  )}
                  {round.state === "closing" && running && (
                    <span className="text-amber-600">
                      backstop{" "}
                      <Countdown
                        remainingS={(round.actualStartS ?? 0) + tournament.roundDurationS + GRACE_S - te}
                        paused={paused}
                      />
                    </span>
                  )}
                  {round.state === "closed" && "closed"}
                  {round.state === "scheduled" && `at +${Math.round(round.scheduledStartS / 60)}m`}
                </span>
              </header>
              <div className="flex flex-col gap-2">
                {roundSlots.map((slot) => {
                  const m = mergeBySlot.get(slot.id);
                  if (!m) {
                    return (
                      <div key={slot.id} className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">
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
                  const mine = viewerId !== null && (m.bearerAId === viewerId || m.bearerBId === viewerId);
                  return (
                    <Link
                      key={slot.id}
                      href={`/${tournament.slug}/merge/${m.id}`}
                      className={`block rounded-lg border p-3 text-sm hover:border-strong ${
                        mine
                          ? "border-live ring-1 ring-live"
                          : "border-line"
                      }`}
                    >
                      <p className="font-medium">
                        {nameOf.get(m.bearerAId ?? "") ?? "?"} + {nameOf.get(m.bearerBId ?? "") ?? "?"}
                        {m.isAdHoc && <span className="ml-1 text-xs text-muted">(ad-hoc)</span>}
                        {mine && <span className="ml-1 text-xs text-live-ink">you are here</span>}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {title(m.textAId)} + {title(m.textBId)}
                      </p>
                      <p className="mt-1 text-xs">
                        {m.state === "resolved" ? (
                          m.flipSeed !== null ? (
                            <FlipReveal
                              flipKey={m.id}
                              a={m.resolution === "bearer_flip" ? nameOf.get(m.bearerAId ?? "") ?? "?" : title(m.textAId)}
                              b={m.resolution === "bearer_flip" ? nameOf.get(m.bearerBId ?? "") ?? "?" : title(m.textBId)}
                            >
                              <span className="text-muted">
                                {RESOLUTION_LABEL[m.resolution ?? ""] ?? m.resolution}
                              </span>
                            </FlipReveal>
                          ) : (
                            <span className="text-muted">{RESOLUTION_LABEL[m.resolution ?? ""] ?? m.resolution}</span>
                          )
                        ) : m.state === "open" ? (
                          <span className="text-green-600">negotiating</span>
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
  const db = await getDb();
  const [finalSlot] = await db
    .select()
    .from(slots)
    .where(and(eq(slots.tournamentId, tournament.id), eq(slots.roundNo, roundsCount)));
  if (finalSlot?.outState !== "filled" || !finalSlot.outTextId) {
    return (
      <p className="mt-6 rounded-lg border border-line p-4">
        The tournament concluded with no canonical text.
      </p>
    );
  }
  return (
    <p className="mt-6 rounded-lg border-2 border-green-600 p-4 text-lg">
      🏆 The canonical text has emerged:{" "}
      <Link className="font-semibold underline" href={`/${tournament.slug}/text/${finalSlot.outTextId}`}>
        read it
      </Link>
    </p>
  );
}
