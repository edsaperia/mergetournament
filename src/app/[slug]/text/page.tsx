import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { rounds, slots } from "../../../db/schema";
import { currentParticipant, tournamentBySlug } from "../../../server/session";

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

  return (
    <main className="mx-auto max-w-xl flex-1 px-6 py-16">
      <p className="text-soft">
        No canonical text yet — it emerges when the tournament completes.
      </p>
    </main>
  );
}
