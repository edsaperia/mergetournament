/**
 * The product-owned explainer, participant point of view. Deliberately not
 * stored per tournament: it stays accurate as the product evolves, and the
 * admin's intro can focus on what only they know.
 */
export function HowItWorks({ open = false }: { open?: boolean }) {
  return (
    <details open={open} className="rounded-md border border-edge px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold">How does a merge tournament work?</summary>
      <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-soft">
        <li>Everyone writes their own draft — a complete text, not notes.</li>
        <li>
          When the tournament starts, all drafts are paired at random into a knockout bracket.
          The pairing is drawn from a published commitment, so nobody — including the admin —
          can rig it.
        </li>
        <li>
          Each round, you and your partner sit together and merge your two texts into one,
          against a countdown. If you both agree on the merged text, it advances. If time runs
          out without agreement, a recorded coin flip decides which of the two input texts
          advances instead — so it always pays to find the version you can both live with.
        </li>
        <li>
          Whoever carries the advancing text repeats this in the next round with a new partner,
          merging again, until a single text remains: the canonical result.
        </li>
        <li>
          Afterwards, the random seed is revealed and every flip can be checked against the
          audit log. Your original draft is never edited or lost — everything stays readable,
          with its full history.
        </li>
      </ol>
    </details>
  );
}
