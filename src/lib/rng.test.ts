import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { flip, mulberry32, randomInt, shuffle } from "./rng";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const a = mulberry32(seed);
        const b = mulberry32(seed);
        for (let i = 0; i < 100; i++) expect(a()).toBe(b());
      })
    );
  });

  it("emits values in [0, 1)", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const rng = mulberry32(seed);
        for (let i = 0; i < 1000; i++) {
          const v = rng();
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
        }
      })
    );
  });
});

describe("randomInt / flip", () => {
  it("stays in [0, n)", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 10_000 }), (seed, n) => {
        const rng = mulberry32(seed);
        for (let i = 0; i < 200; i++) {
          const v = randomInt(rng, n);
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(n);
        }
      })
    );
  });

  it("rejects non-positive n", () => {
    const rng = mulberry32(1);
    expect(() => randomInt(rng, 0)).toThrow();
    expect(() => randomInt(rng, -3)).toThrow();
  });

  it("flip yields both faces over many draws", () => {
    const rng = mulberry32(42);
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(flip(rng));
    expect(seen).toEqual(new Set([0, 1]));
  });
});

describe("shuffle", () => {
  it("returns a permutation and leaves the input untouched", () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(fc.integer(), { maxLength: 200 }), (seed, items) => {
        const original = items.slice();
        const out = shuffle(items, mulberry32(seed));
        expect(items).toEqual(original);
        expect(out.slice().sort((a, b) => a - b)).toEqual(items.slice().sort((a, b) => a - b));
      })
    );
  });

  it("is deterministic per seed", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    expect(shuffle(items, mulberry32(7))).toEqual(shuffle(items, mulberry32(7)));
  });
});
