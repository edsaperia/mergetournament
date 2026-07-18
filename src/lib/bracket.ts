/**
 * Bracket construction (SPEC §4, Phase 2).
 *
 * The tree is built by repeated halving: each round pairs the surviving texts
 * two by two; an odd count gives exactly one bye, which stands over to the
 * next round. The tree shape is a pure function of n and is fixed at
 * publication; only the assignment of drafts to round-1 positions is random.
 */

import { Rng, shuffle } from "./rng";

export type SlotKind = "merge" | "bye";

export interface Slot {
  /** 1-based round number. */
  round: number;
  /** Position within the round; also this slot's outgoing position into the next round. */
  index: number;
  kind: SlotKind;
  /** Incoming positions (within this round) this slot consumes: two for a merge, one for a bye. */
  feeders: [number, number] | [number];
}

export interface Bracket {
  n: number;
  /** rounds[r - 1] is the slots of round r, ordered by index. */
  rounds: Slot[][];
  /** Survivor count entering each round, ending with the final 1. E.g. n=20 → [20, 10, 5, 3, 2, 1]. */
  counts: number[];
}

/**
 * Build the bracket shape for n drafts (n ≥ 2). Deterministic: byes always
 * attach to the last incoming position of an odd round — fairness comes from
 * random seeding, not bye placement.
 */
export function buildBracket(n: number): Bracket {
  if (!Number.isInteger(n) || n < 2) {
    throw new Error(`buildBracket: need an integer n >= 2, got ${n}`);
  }
  const rounds: Slot[][] = [];
  const counts: number[] = [n];
  let count = n;
  let round = 0;
  while (count > 1) {
    round++;
    const merges = Math.floor(count / 2);
    const slots: Slot[] = [];
    for (let j = 0; j < merges; j++) {
      slots.push({ round, index: j, kind: "merge", feeders: [2 * j, 2 * j + 1] });
    }
    if (count % 2 === 1) {
      slots.push({ round, index: merges, kind: "bye", feeders: [count - 1] });
    }
    rounds.push(slots);
    count = slots.length;
    counts.push(count);
  }
  return { n, rounds, counts };
}

/** Number of rounds for n drafts. */
export function numRounds(n: number): number {
  return buildBracket(n).rounds.length;
}

/**
 * Assign drafts to round-1 incoming positions uniformly at random.
 * Returns seeding[position] = index into `draftIds`.
 */
export function seedBracket<T>(draftIds: readonly T[], rng: Rng): T[] {
  if (draftIds.length < 2) {
    throw new Error(`seedBracket: need at least 2 drafts, got ${draftIds.length}`);
  }
  return shuffle(draftIds, rng);
}
