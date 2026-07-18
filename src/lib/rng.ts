/**
 * Deterministic seeded RNG. Every random choice the system makes — seeding,
 * bearer flips, backstop flips, ad-hoc pairing — draws from one of these,
 * with the seed recorded in the audit log so the tournament is reproducible.
 */

export type Rng = () => number;

/** mulberry32: fast 32-bit PRNG, uniform in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [0, n). */
export function randomInt(rng: Rng, n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`randomInt: n must be a positive integer, got ${n}`);
  return Math.floor(rng() * n);
}

/** A coin flip: 0 or 1. */
export function flip(rng: Rng): 0 | 1 {
  return randomInt(rng, 2) as 0 | 1;
}

/** Fisher–Yates shuffle; returns a new array, input untouched. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
