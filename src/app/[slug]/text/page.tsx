import { notFound, redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { rounds, slots, textVersions } from "../../../db/schema";
import { roundsFor } from "../../../server/queries";
import { currentParticipant, tournamentBySlug } from "../../../server/session";
import { Timeline } from "../admin/timeline";

/** /[slug]/text — the canonical text's permanent address once it exists. */
export default async function CanonicalTextPage(props: PageProps<"/[slug]/text">) {
  const { slug } = await props.params;
  const tournament = await tournamentBySlug(slug);
  if (!tournament) notFound();
  if (tournament.visibility === "participants_only" && !(await currentParticipant(slug))) notFound();

  if (tournament.phase === "complete") {
    const db = await getDb();
    const finalRoundNo = (await db.select().from(rounds).where(eq(rounds.tournamentId, tournament.id))).length;
    const [finalSlot] = await db
      .select()
      .from(slots)
      .where(and(eq(slots.tournamentId, tournament.id), eq(slots.roundNo, finalRoundNo)));
    if (finalSlot?.outState === "filled" && finalSlot.outTextId) {
      redirect(`/${slug}/text/${finalSlot.outTextId}`);
    }
    return (
      <main className="mx-auto max-w-xl flex-1 px-6 py-16">
        <p className="text-soft">This tournament concluded with no canonical text.</p>
      </main>
    );
  }

  // Not complete yet: this address is already citable, so show where the
  // tournament is on its way to producing the text that will live here.
  const db = await getDb();
  const allRounds = await roundsFor(tournament.id);
  const [{ drafts }] = await db
    .select({ drafts: count() })
    .from(textVersions)
    .where(and(eq(textVersions.tournamentId, tournament.id), eq(textVersions.kind, "draft")));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <p className="mb-6 text-soft">
        No canonical text yet — it emerges when the tournament completes. Here is how it is
        getting on:
      </p>
      <Timeline
        slug={slug}
        tournament={tournament}
        allRounds={allRounds}
        submitted={drafts}
        invited={0}
        readOnly
      />
    </main>
  );
}
