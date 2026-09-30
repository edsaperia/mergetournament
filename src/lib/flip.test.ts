import { describe, expect, it } from "vitest";
import { FLIP_FRESH_MS, flipKeysFor, isFreshFlip } from "./flip";

describe("isFreshFlip", () => {
  const at = new Date("2026-09-30T12:00:00Z");
  it("is a flip resolved within the reveal window", () => {
    expect(isFreshFlip({ state: "resolved", flipSeed: 7, resolvedAt: at }, at.getTime() + FLIP_FRESH_MS - 1)).toBe(true);
  });
  it("is not once the window has passed, without a flip, or unresolved", () => {
    expect(isFreshFlip({ state: "resolved", flipSeed: 7, resolvedAt: at }, at.getTime() + FLIP_FRESH_MS)).toBe(false);
    expect(isFreshFlip({ state: "resolved", flipSeed: null, resolvedAt: at }, at.getTime())).toBe(false);
    expect(isFreshFlip({ state: "open", flipSeed: 7, resolvedAt: null }, at.getTime())).toBe(false);
  });
});

describe("flipKeysFor", () => {
  const flips = [
    { key: "m1", roundNo: 1, resultTextId: "t1" },
    { key: "m2", roundNo: 1, resultTextId: "t2" },
  ];
  it("names the flips that sent on a later card's texts", () => {
    expect(flipKeysFor(flips, 2, ["t1", "t2"])).toEqual(["m1", "m2"]);
    expect(flipKeysFor(flips, 2, ["t1", "t9"])).toEqual(["m1"]);
    expect(flipKeysFor(flips, 2, [null])).toEqual([]);
  });
  it("leaves out the flip's own round: a text sent on unchanged keeps its id", () => {
    expect(flipKeysFor(flips, 1, ["t1"])).toEqual([]);
  });
});
