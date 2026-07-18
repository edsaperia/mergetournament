import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Merge Tournament</h1>
      <p className="text-lg text-neutral-600 dark:text-neutral-300">
        A fair method for combining many draft documents into one by knockout
        tournament of pairwise negotiations.
      </p>
      <p className="text-neutral-600 dark:text-neutral-300">
        Drafts are seeded into a bracket at random. Pairs negotiate a merged
        text against the clock; both must consent, or a coin flip decides.
        Rounds halve the field until one canonical text remains — with full
        provenance back to every original draft.
      </p>
      <div>
        <Link
          href="/new"
          className="inline-block rounded-lg bg-neutral-900 px-5 py-3 font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Create a tournament
        </Link>
      </div>
      <p className="text-sm text-neutral-500">
        Free software (AGPL-3.0):{" "}
        <a className="underline" href="https://github.com/edsaperia/mergetournament">
          github.com/edsaperia/mergetournament
        </a>
      </p>
    </main>
  );
}
