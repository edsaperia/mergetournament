import Link from "next/link";
import { FullStory } from "./full-story";
import { Logo } from "./logo";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 px-6 pb-16 pt-8">
      <div className="flex items-center gap-4">
        <Logo className="h-14 w-14" />
        <h1 className="text-4xl font-bold tracking-tight">Merge Tournament</h1>
      </div>
      <p className="text-lg text-soft">
        A fair method for combining many draft documents into one by knockout
        tournament of pairwise negotiations.
      </p>
      <p className="text-soft">
        Drafts are seeded into a bracket at random. Pairs negotiate a merged
        text against the clock; both must consent, or a coin flip decides.
        Rounds halve the field until one canonical text remains — with full
        provenance back to every original draft.
      </p>
      <FullStory />
      <div>
        <Link
          href="/new"
          className="inline-block rounded-lg bg-accent px-5 py-3 font-medium text-accent-ink hover:bg-accent-soft"
        >
          Create a tournament
        </Link>
      </div>
      <p className="text-sm text-muted">
        Free software (AGPL-3.0):{" "}
        <a className="underline" href="https://github.com/edsaperia/mergetournament">
          github.com/edsaperia/mergetournament
        </a>
      </p>
    </main>
  );
}
