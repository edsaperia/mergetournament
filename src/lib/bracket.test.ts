import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildBracket, numRounds, seedBracket } from "./bracket";
import { mulberry32 } from "./rng";

const anyN = fc.integer({ min: 2, max: 2000 });

describe("buildBracket", () => {
  it("rejects n < 2 and non-integers", () => {
    expect(() => buildBracket(1)).toThrow();
    expect(() => buildBracket(0)).toThrow();
    expect(() => buildBracket(2.5)).toThrow();
  });

  it("matches the spec's n=20 example: counts 20,10,5,3,2,1 over five rounds", () => {
    const b = buildBracket(20);
    expect(b.counts).toEqual([20, 10, 5, 3, 2, 1]);
    expect(b.rounds.map((r) => r.filter((s) => s.kind === "merge").length)).toEqual([10, 5, 2, 1, 1]);
    expect(b.rounds.map((r) => r.filter((s) => s.kind === "bye").length)).toEqual([0, 0, 1, 1, 0]);
  });

  it("halves survivor counts by ceil division down to 1", () => {
    fc.assert(
      fc.property(anyN, (n) => {
        const b = buildBracket(n);
        for (let i = 0; i + 1 < b.counts.length; i++) {
          expect(b.counts[i + 1]).toBe(Math.ceil(b.counts[i] / 2));
        }
        expect(b.counts[0]).toBe(n);
        expect(b.counts[b.counts.length - 1]).toBe(1);
      })
    );
  });

  it("takes ceil(log2 n) rounds", () => {
    fc.assert(
      fc.property(anyN, (n) => {
        expect(numRounds(n)).toBe(Math.ceil(Math.log2(n)));
      })
    );
  });

  it("gives every text exactly one fate: each incoming position feeds exactly one slot", () => {
    fc.assert(
      fc.property(anyN, (n) => {
        const b = buildBracket(n);
        b.rounds.forEach((slots, i) => {
          const incoming = b.counts[i];
          const consumed = slots.flatMap((s) => s.feeders);
          expect(consumed.slice().sort((a, x) => a - x)).toEqual(
            Array.from({ length: incoming }, (_, p) => p)
          );
        });
      })
    );
  });

  it("has correct bye counts: exactly one bye iff the incoming count is odd", () => {
    fc.assert(
      fc.property(anyN, (n) => {
        const b = buildBracket(n);
        b.rounds.forEach((slots, i) => {
          const incoming = b.counts[i];
          const byes = slots.filter((s) => s.kind === "bye");
          expect(byes.length).toBe(incoming % 2);
          expect(slots.filter((s) => s.kind === "merge").length).toBe(Math.floor(incoming / 2));
          for (const bye of byes) expect(bye.feeders).toEqual([incoming - 1]);
        });
      })
    );
  });

  it("forms a provenance tree: exactly n - 1 merges in total", () => {
    fc.assert(
      fc.property(anyN, (n) => {
        const b = buildBracket(n);
        const merges = b.rounds.flat().filter((s) => s.kind === "merge").length;
        expect(merges).toBe(n - 1);
      })
    );
  });

  it("numbers slots consecutively so outgoing positions are dense", () => {
    fc.assert(
      fc.property(anyN, (n) => {
        const b = buildBracket(n);
        b.rounds.forEach((slots) => {
          slots.forEach((s, j) => expect(s.index).toBe(j));
        });
      })
    );
  });

  it("is deterministic: the shape is a pure function of n", () => {
    fc.assert(
      fc.property(anyN, (n) => {
        expect(buildBracket(n)).toEqual(buildBracket(n));
      })
    );
  });
});

describe("seedBracket", () => {
  it("rejects fewer than 2 drafts", () => {
    expect(() => seedBracket([], mulberry32(1))).toThrow();
    expect(() => seedBracket(["a"], mulberry32(1))).toThrow();
  });

  it("returns a permutation of the drafts", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 2, max: 500 }), (seed, n) => {
        const drafts = Array.from({ length: n }, (_, i) => `draft-${i}`);
        const seeded = seedBracket(drafts, mulberry32(seed));
        expect(seeded.slice().sort()).toEqual(drafts.slice().sort());
      })
    );
  });

  it("is reproducible from the recorded seed", () => {
    const drafts = Array.from({ length: 20 }, (_, i) => i);
    expect(seedBracket(drafts, mulberry32(123))).toEqual(seedBracket(drafts, mulberry32(123)));
  });

  it("actually varies with the seed", () => {
    const drafts = Array.from({ length: 20 }, (_, i) => i);
    const a = seedBracket(drafts, mulberry32(1));
    const b = seedBracket(drafts, mulberry32(2));
    expect(a).not.toEqual(b);
  });
});
