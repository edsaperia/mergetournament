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
          Each round, you and your partner sit together and merge your two texts into one in a
          shared editor, against a countdown. Lock it in together and it goes into the next round at once. When
          the countdown runs out, the text freezes and you have 60 seconds to decide:
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5">
            <li>you both accept: the merged text goes into the next round;</li>
            <li>
              only one of you took part this round: their Accept sends the merged text into the next
              round (their own input if the merged text is blank), and anything else sends their own input;
            </li>
            <li>you both took part but don&apos;t both accept: a recorded coin flip picks one input text to go into the next round unchanged;</li>
            <li>neither of you took part: the merge is abandoned and its place in the bracket stays empty.</li>
          </ul>
          So it pays to find a version you can both live with.
        </li>
        <li>
          Whoever goes into the next round repeats this there with a new partner, merging again,
          until a single text remains: the final text.
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
