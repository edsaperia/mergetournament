/**
 * Coin flips still being performed (SPEC §4). A flip is played to viewers
 * for a short while after it happened (FlipReveal); until it lands, nothing
 * on the page may name its result.
 */

/** How long after a flip its reveal still plays; later visitors see history. */
export const FLIP_FRESH_MS = 120_000;

/** A merge resolved by a coin flip within the last FLIP_FRESH_MS. */
export function isFreshFlip(
  m: { state: string; flipSeed: unknown; resolvedAt: Date | null },
  nowMs: number
): boolean {
  return m.state === "resolved" && m.flipSeed !== null && m.resolvedAt !== null && nowMs - m.resolvedAt.getTime() < FLIP_FRESH_MS;
}

/** A fresh flip: its key (the merge id), its round, and the text it sent on. */
export interface FreshFlip {
  key: string;
  roundNo: number;
  resultTextId: string | null;
}

/**
 * The flips whose result a later round's card would give away: the ones
 * that sent on one of `textIds`, from a round before `roundNo`. A text that
 * went on unchanged keeps its id, so the earlier round is what tells the
 * flip's result apart from its inputs.
 */
export function flipKeysFor(flips: readonly FreshFlip[], roundNo: number, textIds: readonly (string | null)[]): string[] {
  return flips
    .filter((f) => f.roundNo < roundNo && f.resultTextId !== null && textIds.includes(f.resultTextId))
    .map((f) => f.key);
}
