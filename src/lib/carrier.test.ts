import { describe, expect, it } from "vitest";
import { carrierLine, carrierOutcome, type CarrierPrefs } from "./carrier";
import { newSession, resolveMerge, type Side } from "./engine";
import { mulberry32 } from "./rng";

const picks: (Side | null)[] = [null, "A", "B"];
const all: CarrierPrefs[] = picks.flatMap((A) => picks.map((B) => ({ A, B })));
const names = { A: "Ada", B: "Ben" };

describe("carrierOutcome", () => {
  it("agrees with resolveMerge for every pair of picks", () => {
    for (const prefs of all) {
      const session = { ...newSession(), lock: "locked" as const, workingText: "x", bearerPref: prefs };
      const r = resolveMerge({ text: "a", bearer: "ada" }, { text: "b", bearer: "ben" }, session, null, mulberry32(1));
      const outcome = carrierOutcome(prefs);
      if (outcome === "flip") {
        expect(r.kind).toBe("BEARER_FLIP");
      } else {
        expect(r.kind).toBe("AGREED");
        expect(r.advancing?.bearer).toBe(outcome === "A" ? "ada" : "ben");
      }
    }
  });

  it("one pick alone is enough; a flip needs differing picks or none", () => {
    expect(carrierOutcome({ A: null, B: "A" })).toBe("A");
    expect(carrierOutcome({ A: "B", B: null })).toBe("B");
    expect(carrierOutcome({ A: null, B: null })).toBe("flip");
    expect(carrierOutcome({ A: "A", B: "B" })).toBe("flip");
  });
});

describe("carrierLine", () => {
  it("shows the partner's pick", () => {
    expect(carrierLine("A", names, { A: null, B: "A" })).toBe(
      "Ben picked you. That stands, so you carry it forward, unless you pick differently."
    );
    expect(carrierLine("A", names, { A: null, B: "B" })).toBe(
      "Ben wants to carry it. That stands, so Ben carries it forward, unless you pick differently."
    );
  });

  it("says a coin flip decides only when the picks differ or nobody picks", () => {
    for (const prefs of all) {
      for (const side of ["A", "B"] as const) {
        const line = carrierLine(side, names, prefs);
        expect(line.includes("coin flip chooses the carrier")).toBe(carrierOutcome(prefs) === "flip");
      }
    }
    expect(carrierLine("B", names, { A: "A", B: "B" })).toBe(
      "You picked yourself; Ada wants to carry it. Unless one of you changes, a coin flip chooses the carrier."
    );
    expect(carrierLine("A", names, { A: "B", B: "B" })).toBe("You both agree: Ben carries it forward.");
    expect(carrierLine("A", names, { A: "A", B: null })).toBe(
      "You picked yourself. Ben hasn't picked, so you carry it forward unless Ben picks differently."
    );
  });
});
