import Link from "next/link";
import { whatNow } from "../../lib/resolution";
import { mergesFor, nameMapFor, roundsFor, slotsFor } from "../../server/queries";

/**
 * A bearer whose last merge has resolved without them carrying on (partner
 * carries, they were away, or the pair was abandoned) gets one line saying
 * so and what they can still do. Carriers see their next merge in the bracket.
 */
export async function WhatNow({ tournamentId, slug, meId }: { tournamentId: string; slug: string; meId: string }) {
  const [allSlots, allMerges, nameOf, allRounds] = await Promise.all([
    slotsFor(tournamentId),
    mergesFor(tournamentId),
    nameMapFor(tournamentId),
    roundsFor(tournamentId),
  ]);
  const roundOf = new Map(allSlots.map((s) => [s.id, s.roundNo]));
  const mine = allMerges
    .filter((m) => m.bearerAId === meId || m.bearerBId === meId)
    .sort((x, y) => (roundOf.get(y.slotId) ?? 0) - (roundOf.get(x.slotId) ?? 0));
  const latest = mine[0];
  if (!latest || latest.state !== "resolved" || latest.advancingBearerId === meId) return null;
  const roundNo = roundOf.get(latest.slotId) ?? 0;
  return (
    <p className="mb-6 rounded-lg border border-edge bg-panel px-4 py-3 text-sm">
      {whatNow(latest, meId, (id) => nameOf.get(id ?? "") ?? "?", roundNo, roundNo === allRounds.length)}{" "}
      <Link className="underline" href={`/${slug}/merge/${latest.id}`}>
        See your round {roundNo} merge
      </Link>
    </p>
  );
}
