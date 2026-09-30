import { describe, expect, it } from "vitest";
import { resolutionLabel, resolutionSentence, type ResolvedMergeView } from "./resolution";

const names: Record<string, string> = { ada: "Ada", ben: "Ben" };
const nameOf = (id: string | null) => names[id ?? ""] ?? "?";
const base: ResolvedMergeView = {
  resolution: null,
  bearerAId: "ada",
  bearerBId: "ben",
  textAId: "tA",
  textBId: "tB",
  resultTextId: null,
  advancingBearerId: null,
};
const JARGON = /backstop|active advance|active_advance|bearer_flip|bearer flip/i;

describe("resolutionSentence", () => {
  it("says which input a coin flip advanced", () => {
    const m = { ...base, resolution: "backstop_flip", resultTextId: "tB", advancingBearerId: "ben" };
    expect(resolutionSentence(m, nameOf, false)).toBe(
      "No agreement, so a coin flip between the inputs: Ben's input advances unchanged."
    );
    expect(resolutionSentence(m, nameOf, true)).toContain("Ben's input becomes the final text unchanged.");
  });

  it("tells a sole active bearer's accepted merge from their unchanged input", () => {
    const merged = { ...base, resolution: "active_advance", resultTextId: "new", advancingBearerId: "ada" };
    expect(resolutionSentence(merged, nameOf, false)).toBe("Only Ada took part, so the merged text Ada accepted advances.");
    const input = { ...merged, resultTextId: "tA" };
    expect(resolutionSentence(input, nameOf, false)).toBe(
      "Only Ada took part and didn't accept the merge, so Ada's input advances unchanged."
    );
  });

  it("explains abandonment and never shows an enum name", () => {
    expect(resolutionSentence({ ...base, resolution: "abandoned" }, nameOf, false)).toMatch(/^Neither bearer took part/);
    for (const r of ["agreed", "bearer_flip", "backstop_flip", "active_advance", "abandoned", "walkover"]) {
      const m = { ...base, resolution: r, resultTextId: "tA", advancingBearerId: "ada" };
      expect(resolutionSentence(m, nameOf, false)).not.toMatch(JARGON);
      expect(resolutionSentence(m, nameOf, true)).not.toMatch(JARGON);
      expect(resolutionLabel(r)).not.toMatch(JARGON);
    }
  });
});
