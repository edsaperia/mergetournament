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
      "Ben picked you. That stands, so you go into the next round, unless you pick differently."
    );
    expect(carrierLine("A", names, { A: null, B: "B" })).toBe(
      "Ben picked themselves. That stands, so Ben goes into the next round, unless you pick differently."
    );
  });

  it("says a coin flip decides only when the picks differ or nobody picks", () => {
    for (const prefs of all) {
      for (const side of ["A", "B"] as const) {
        const line = carrierLine(side, names, prefs);
        expect(line).not.toMatch(/bearer|carrier|carr(y|ies)|advanc/i);
        expect(line.includes("coin flip decides who goes into the next round")).toBe(carrierOutcome(prefs) === "flip");
      }
    }
    expect(carrierLine("B", names, { A: "A", B: "B" })).toBe(
      "You picked yourself; Ada picked themselves. Unless one of you changes, a coin flip decides who goes into the next round."
    );
    expect(carrierLine("A", names, { A: "B", B: "B" })).toBe("You both agree: Ben goes into the next round.");
    expect(carrierLine("A", names, { A: "A", B: null })).toBe(
      "You picked yourself. Ben hasn't picked, so you go into the next round unless Ben picks differently."
    );
  });
});

describe("carrierLine with one player silent", () => {
  const round = (iAmActive: boolean, partnerActive: boolean) => ({ iAmActive, partnerActive, window: false });
  const window = (iAmActive: boolean, partnerActive: boolean) => ({ iAmActive, partnerActive, window: true });

  it("tells the active player they go on if their partner stays silent, whatever they picked", () => {
    expect(carrierLine("A", names, { A: "B", B: null }, round(true, false))).toBe(
      "You picked Ben. If Ben stays silent, you go into the next round when time runs out; the picks count only if you both lock in."
    );
    expect(carrierLine("A", names, { A: "B", B: null }, window(true, false))).toBe(
      "You picked Ben. If Ben stays silent, you go into the next round; the picks count only if you both accept."
    );
    expect(carrierLine("A", names, { A: null, B: null }, window(true, false))).toBe(
      "If Ben stays silent, you go into the next round; the picks count only if you both accept."
    );
  });

  it("tells the silent player their partner goes on unless they respond, even when picked", () => {
    expect(carrierLine("B", names, { A: "B", B: null }, window(false, true))).toBe(
      "Ada picked you, but if you stay silent, Ada goes into the next round; the picks count only if you both accept."
    );
    expect(carrierLine("B", names, { A: "A", B: null }, round(false, true))).toBe(
      "Ada picked themselves. If you stay silent, Ada goes into the next round when time runs out; the picks count only if you both lock in."
    );
    expect(carrierLine("B", names, { A: null, B: null }, window(false, true))).toBe(
      "If you stay silent, Ada goes into the next round; the picks count only if you both accept."
    );
  });

  it("matches resolveMerge: with one active, the active one's side goes on whatever the picks", () => {
    for (const prefs of all) {
      for (const active of ["A", "B"] as const) {
        const session = { ...newSession(), workingText: "x", bearerPref: prefs, active: { A: active === "A", B: active === "B" } };
        const r = resolveMerge({ text: "a", bearer: "ada" }, { text: "b", bearer: "ben" }, session, null, mulberry32(1));
        expect(r.advancing?.bearer).toBe(active === "A" ? "ada" : "ben");
        for (const me of ["A", "B"] as const) {
          const line = carrierLine(me, names, prefs, window(me === active, me !== active));
          expect(line).toContain(me === active ? "you go into the next round" : `${names[active]} goes into the next round`);
          expect(line).not.toMatch(/bearer|carrier|carr(y|ies)|advanc|coin flip/i);
        }
      }
    }
  });

  it("with both active (or neither), says what the picks add up to, as before", () => {
    expect(carrierLine("A", names, { A: null, B: "A" }, window(true, true))).toBe(carrierLine("A", names, { A: null, B: "A" }));
    expect(carrierLine("A", names, { A: null, B: null }, round(false, false))).toBe(carrierLine("A", names, { A: null, B: null }));
  });
});
