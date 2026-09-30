import Link from "next/link";
import { sittingOutLine, whatNow } from "../../lib/resolution";
import { flipKeysFor } from "../../lib/flip";
import { freshFlipsFor, mergesFor, nameMapFor, roundsFor, slotsFor } from "../../server/queries";
import { ShownOnceLanded } from "./flip-reveal";

/**
 * A player's one line on the event page about where they stand, when the
 * bracket alone doesn't say it: their text has a bye or stands over (no
 * partner this round), or their last merge resolved without them going on
 * (partner goes on, they were away, or the pair was abandoned). Players who
 * go on see their next merge in the bracket.
 */
export async function WhatNow({
  tournamentId,
  slug,
  meId,
  complete,
}: {
  tournamentId: string;
  slug: string;
  meId: string;
  /** The tournament has completed. */
  complete: boolean;
}) {
  const [allSlots, allMerges, nameOf, allRounds, flips] = await Promise.all([
    slotsFor(tournamentId),
    mergesFor(tournamentId),
    nameMapFor(tournamentId),
    roundsFor(tournamentId),
    freshFlipsFor(tournamentId),
  ]);
  const roundOf = new Map(allSlots.map((s) => [s.id, s.roundNo]));
  const mine = allMerges
    .filter((m) => m.bearerAId === meId || m.bearerBId === meId)
    .sort((x, y) => (roundOf.get(y.slotId) ?? 0) - (roundOf.get(x.slotId) ?? 0));
  const latest = mine[0];

  // A slot holding my text with no merge in it: a bye, or my text standing over.
  const withMerge = new Set(allMerges.map((m) => m.slotId));
  const sitting = allSlots
    .filter((s) => !withMerge.has(s.id) && s.outState === "filled" && s.outBearerId === meId && s.outTextId)
    .sort((x, y) => y.roundNo - x.roundNo)[0];
  if (sitting && (!latest || sitting.roundNo > (roundOf.get(latest.slotId) ?? 0))) {
    // Standing over after winning a coin flip names the winner: left out,
    // not just hidden (its space alone would tell), until the coin lands.
    return (
      <ShownOnceLanded flipKey={flipKeysFor(flips, sitting.roundNo, [sitting.outTextId])}>
        <p className="mb-6 rounded-lg border border-live bg-panel px-4 py-3 text-sm">
          {sittingOutLine({
            kind: sitting.kind === "bye" ? "bye" : "standOver",
            roundNo: sitting.roundNo,
            finalRound: sitting.roundNo === allRounds.length,
            // Until they have merged, the text they hold is their own draft.
            isDraft: mine.length === 0,
            tournamentOver: complete,
          })}{" "}
          <Link className="underline" href={`/${slug}/text/${sitting.outTextId}`}>
            {mine.length === 0 ? "Read your draft" : "Read your text"}
          </Link>
        </p>
      </ShownOnceLanded>
    );
  }

  if (!latest || latest.state !== "resolved" || latest.advancingBearerId === meId) return null;
  const roundNo = roundOf.get(latest.slotId) ?? 0;
  // Only a player who didn't go on gets this line, so it waits for the coin too.
  return (
    <ShownOnceLanded flipKey={flips.some((f) => f.key === latest.id) ? latest.id : null}>
      <p className="mb-6 rounded-lg border border-edge bg-panel px-4 py-3 text-sm">
        {whatNow(latest, meId, (id) => nameOf.get(id ?? "") ?? "?", roundNo, roundNo === allRounds.length, complete)}{" "}
        <Link className="underline" href={`/${slug}/merge/${latest.id}`}>
          See your round {roundNo} merge
        </Link>
      </p>
    </ShownOnceLanded>
  );
}
