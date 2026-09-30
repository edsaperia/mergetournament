import { describe, expect, it } from "vitest";
import { newSession, resolveMerge } from "./engine";
import { mulberry32 } from "./rng";
import { resolutionLabel, resolutionSentence, whatNow, type ResolvedMergeView } from "./resolution";

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
      "Only Ada took part, and there was no accepted merged text, so Ada's input advances unchanged."
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

describe("whatNow", () => {
  const flip = { ...base, resolution: "backstop_flip", resultTextId: "tA", advancingBearerId: "ada" };
  it("tells the bearer who didn't carry that they're done, and what they can do", () => {
    expect(whatNow(flip, "ben", nameOf, 1, false)).toBe(
      "Ada carries this forward. You're done merging; watch the other merges or join the chat."
    );
  });
  it("tells the carrier where they go next", () => {
    expect(whatNow(flip, "ada", nameOf, 1, false)).toBe(
      "You carry this into round 2. In the break, read the texts and find your next partner."
    );
  });
  it("tells an absent bearer what happened while they were away", () => {
    const solo = { ...base, resolution: "active_advance", resultTextId: "new", advancingBearerId: "ada" };
    expect(whatNow(solo, "ben", nameOf, 1, false)).toBe(
      "While you were away, only Ada took part, so the merged text they accepted goes on with Ada. " +
        "You're done merging; watch the other merges or join the chat."
    );
  });
  it("explains an abandoned pair and the final", () => {
    expect(whatNow({ ...base, resolution: "abandoned" }, "ben", nameOf, 1, false)).toMatch(
      /^Neither of you took part, so neither text goes on\./
    );
    expect(whatNow({ ...flip, advancingBearerId: null }, "ada", nameOf, 2, true)).toMatch(/^That was the final/);
    const soloFinal = { ...base, resolution: "active_advance", resultTextId: "new", advancingBearerId: "ada" };
    expect(whatNow(soloFinal, "ben", nameOf, 2, true)).toBe(
      "While you were away, only Ada took part, so the merged text they accepted became the final text. Read it or join the chat."
    );
  });
});

describe("whatNow once the tournament is over", () => {
  it("stops telling an eliminated bearer to watch the other merges", () => {
    const flip = { ...base, resolution: "backstop_flip", resultTextId: "tA", advancingBearerId: "ada" };
    expect(whatNow(flip, "ben", nameOf, 1, false, false)).toContain("watch the other merges");
    const over = whatNow(flip, "ben", nameOf, 1, false, true);
    expect(over).toBe("Ada carries this forward. The tournament is over; read the final text or look back through the bracket.");
    expect(whatNow({ ...base, resolution: "abandoned" }, "ben", nameOf, 1, false, true)).not.toContain("watch the other merges");
  });
});

describe("a lone bearer who accepts a blank merged text", () => {
  it("is described truly: the engine advances their input, and the sentence says so", () => {
    const session = { ...newSession(), workingText: "  ", active: { A: true, B: false }, proposedBy: "A" as const };
    const r = resolveMerge({ text: "tA", bearer: "ada" }, { text: "tB", bearer: "ben" }, session, "working", mulberry32(1));
    expect(r.kind).toBe("ACTIVE_ADVANCE");
    expect(r.advancing).toEqual({ source: "input", text: "tA", bearer: "ada" });
    const m = { ...base, resolution: "active_advance", resultTextId: r.advancing!.text, advancingBearerId: "ada" };
    expect(resolutionSentence(m, nameOf, false)).toBe(
      "Only Ada took part, and there was no accepted merged text, so Ada's input advances unchanged."
    );
  });
});
