import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildBracket, Slot } from "./bracket";
import {
  applyAction,
  completeRound,
  MergeInput,
  MergeSession,
  newSession,
  planRound,
  ResolvedMerge,
  resolveMerge,
  TextEntry,
} from "./engine";
import { mulberry32, randomInt, Rng } from "./rng";

const A: MergeInput = { text: "<a>", bearer: "alice" };
const B: MergeInput = { text: "<b>", bearer: "bob" };

describe("lock-in state machine", () => {
  it("runs the happy path: edit, propose, confirm", () => {
    let s = newSession();
    s = applyAction(s, { type: "edit", side: "A", text: "draft" });
    s = applyAction(s, { type: "propose", side: "A" });
    expect(s.lock).toBe("proposed");
    s = applyAction(s, { type: "confirm", side: "B" });
    expect(s.lock).toBe("locked");
    expect(s.active).toEqual({ A: true, B: true });
  });

  it("lets the other bearer unfreeze with keep-editing", () => {
    let s = applyAction(newSession(), { type: "propose", side: "B" });
    s = applyAction(s, { type: "keepEditing", side: "A" });
    expect(s.lock).toBe("editing");
    expect(s.proposedBy).toBeNull();
  });

  it("rejects transitions the spec forbids", () => {
    const proposed = applyAction(newSession(), { type: "propose", side: "A" });
    expect(() => applyAction(proposed, { type: "edit", side: "B", text: "x" })).toThrow();
    expect(() => applyAction(proposed, { type: "propose", side: "B" })).toThrow();
    expect(() => applyAction(proposed, { type: "confirm", side: "A" })).toThrow();
    expect(() => applyAction(proposed, { type: "keepEditing", side: "A" })).toThrow();
    expect(() => applyAction(newSession(), { type: "confirm", side: "B" })).toThrow();
    const locked = applyAction(proposed, { type: "confirm", side: "B" });
    expect(() => applyAction(locked, { type: "edit", side: "A", text: "x" })).toThrow();
  });

  it("allows bearer selection at any stage, including after lock", () => {
    let s = newSession();
    s = applyAction(s, { type: "selectBearer", side: "A", pref: "B" });
    s = applyAction(s, { type: "propose", side: "A" });
    s = applyAction(s, { type: "confirm", side: "B" });
    s = applyAction(s, { type: "selectBearer", side: "B", pref: "B" });
    expect(s.bearerPref).toEqual({ A: "B", B: "B" });
  });
});

function session(overrides: Partial<MergeSession>): MergeSession {
  return { ...newSession(), ...overrides };
}

describe("resolveMerge", () => {
  const rng = () => mulberry32(99);

  it("AGREED: locked with matching or single preference; no flip", () => {
    const both = resolveMerge(A, B, session({
      lock: "locked", workingText: "(<a>+<b>)",
      bearerPref: { A: "B", B: "B" }, active: { A: true, B: true },
    }), null, rng());
    expect(both).toEqual({ kind: "AGREED", advancing: { text: "(<a>+<b>)", bearer: "bob" }, flips: [] });

    const single = resolveMerge(A, B, session({
      lock: "locked", workingText: "m",
      bearerPref: { A: "A", B: null }, active: { A: true, B: true },
    }), null, rng());
    expect(single.kind).toBe("AGREED");
    expect(single.advancing).toEqual({ text: "m", bearer: "alice" });
  });

  it("BEARER_FLIP: locked with conflicting or absent preferences", () => {
    const conflicted = resolveMerge(A, B, session({
      lock: "locked", workingText: "m",
      bearerPref: { A: "A", B: "B" }, active: { A: true, B: true },
    }), null, rng());
    expect(conflicted.kind).toBe("BEARER_FLIP");
    expect(conflicted.flips).toHaveLength(1);
    expect(["alice", "bob"]).toContain(conflicted.advancing!.bearer);
    expect(conflicted.advancing!.text).toBe("m");
  });

  it("BACKSTOP_FLIP: unlocked with both active advances an input intact", () => {
    const r = resolveMerge(A, B, session({
      workingText: "half-finished", active: { A: true, B: true },
    }), null, rng());
    expect(r.kind).toBe("BACKSTOP_FLIP");
    expect([A, B]).toContainEqual(r.advancing);
    expect(r.flips).toHaveLength(1);
  });

  it("ACTIVE_ADVANCE: sole active bearer's choice governs, defaulting to their input", () => {
    const active = session({ workingText: "wip", active: { A: false, B: true } });
    expect(resolveMerge(A, B, active, "working", rng()).advancing).toEqual({ text: "wip", bearer: "bob" });
    expect(resolveMerge(A, B, active, "input", rng()).advancing).toEqual({ text: "<b>", bearer: "bob" });
    expect(resolveMerge(A, B, active, null, rng()).advancing).toEqual({ text: "<b>", bearer: "bob" });
    const blank = session({ workingText: "   ", active: { A: true, B: false } });
    expect(resolveMerge(A, B, blank, "working", rng()).advancing).toEqual({ text: "<a>", bearer: "alice" });
  });

  it("ABANDONED: neither bearer active empties the slot", () => {
    const r = resolveMerge(A, B, newSession(), null, rng());
    expect(r).toEqual({ kind: "ABANDONED", advancing: null, flips: [] });
  });

  it("never invents text: what advances is the working text or an input", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.string(),
        fc.constantFrom<MergeSession["lock"]>("editing", "proposed", "locked"),
        fc.boolean(), fc.boolean(),
        fc.constantFrom<"working" | "input" | null>("working", "input", null),
        (seed, working, lock, actA, actB, choice) => {
          const r = resolveMerge(A, B, session({
            lock, workingText: working, active: { A: actA, B: actB },
          }), choice, mulberry32(seed));
          if (r.advancing) {
            expect([working, A.text, B.text]).toContain(r.advancing.text);
            expect([A.bearer, B.bearer]).toContain(r.advancing.bearer);
          }
        }
      )
    );
  });
});

describe("planRound / completeRound", () => {
  const entry = (i: number): TextEntry => ({ text: `<d${i}>`, bearer: `p${i}` });

  it("a lone bye stands over; two idles pair into an ad-hoc merge", () => {
    // n=5 round 1: merges (0,1) (2,3), bye at 4.
    const slots = buildBracket(5).rounds[0];
    const incoming = [0, 1, 2, 3, 4].map(entry);
    const lone = planRound(slots, incoming, mulberry32(1));
    expect(lone.merges.size).toBe(2);
    expect(lone.adHoc).toHaveLength(0);
    expect([...lone.standOver.values()]).toEqual([entry(4)]);

    // Empty position 1 → slot 0 becomes a walkover: two idles now pair up.
    const withWalkover = planRound(slots, [entry(0), null, entry(2), entry(3), entry(4)], mulberry32(1));
    expect(withWalkover.merges.size).toBe(1);
    expect(withWalkover.adHoc).toHaveLength(1);
    expect(withWalkover.standOver.size).toBe(0);
    const m = withWalkover.adHoc[0];
    expect([m.a, m.b].map((x) => x.text).sort()).toEqual(["<d0>", "<d4>"]);
    expect([m.slotA, m.slotB]).toContain(m.resultSlot);
    expect(m.vacatedSlot).not.toBe(m.resultSlot);
  });

  it("completeRound places results, empties vacated slots, and demands every resolution", () => {
    const slots = buildBracket(5).rounds[0];
    const incoming = [entry(0), null, entry(2), entry(3), entry(4)];
    const plan = planRound(slots, incoming, mulberry32(1));
    expect(() => completeRound(slots, plan, new Map())).toThrow();

    const resolutions = new Map<number, ResolvedMerge>();
    for (const [i] of plan.merges) {
      resolutions.set(i, { kind: "AGREED", advancing: { text: "m", bearer: "x" }, flips: [] });
    }
    for (const m of plan.adHoc) {
      resolutions.set(m.resultSlot, { kind: "AGREED", advancing: { text: "adhoc", bearer: "y" }, flips: [] });
    }
    const out = completeRound(slots, plan, resolutions);
    expect(out).toHaveLength(slots.length);
    expect(out.filter(Boolean).map((e) => e!.text).sort()).toEqual(["adhoc", "m"]);
    const vacated = plan.adHoc[0].vacatedSlot;
    expect(out[vacated]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Full-tournament simulation (SPEC §11 property tests)
// ---------------------------------------------------------------------------

/** Randomly pick a bearer-behaviour profile for one merge. */
function randomSession(a: MergeInput, b: MergeInput, rng: Rng): MergeSession {
  const merged = `(${a.text}+${b.text})`;
  switch (randomInt(rng, 6)) {
    case 0: // consensual, agreed bearer
      return session({ lock: "locked", workingText: merged, bearerPref: { A: "A", B: "A" }, active: { A: true, B: true } });
    case 1: // consensual, conflicting bearer prefs → bearer flip
      return session({ lock: "locked", workingText: merged, bearerPref: { A: "A", B: "B" }, active: { A: true, B: true } });
    case 2: // stalled, both present → backstop flip
      return session({ workingText: merged, active: { A: true, B: true } });
    case 3: // only A present
      return session({ workingText: merged, active: { A: true, B: false } });
    case 4: // only B present, blank working text
      return session({ active: { A: false, B: true } });
    default: // both gone
      return session({});
  }
}

function simulate(n: number, seed: number) {
  const rng = mulberry32(seed);
  const bracket = buildBracket(n);
  let incoming: (TextEntry | null)[] = Array.from({ length: n }, (_, i) => ({
    text: `<d${i}>`,
    bearer: `p${i}`,
  }));
  let advances = 0;
  let abandons = 0;

  for (const slots of bracket.rounds) {
    const plan = planRound(slots, incoming, rng);
    // §11: no round contains two idle texts (after ad-hoc pairing).
    expect(plan.standOver.size).toBeLessThanOrEqual(1);

    const resolutions = new Map<number, ResolvedMerge>();
    const resolveOne = (a: MergeInput, b: MergeInput): ResolvedMerge => {
      const choices = ["working", "input", null] as const;
      const r = resolveMerge(a, b, randomSession(a, b, rng), choices[randomInt(rng, 3)], rng);
      if (r.advancing) advances++;
      else abandons++;
      return r;
    };
    for (const [i, { a, b }] of plan.merges) resolutions.set(i, resolveOne(a, b));
    for (const m of plan.adHoc) resolutions.set(m.resultSlot, resolveOne(m.a, m.b));

    incoming = completeRound(slots, plan, resolutions);
    expect(incoming.length).toBe(slots.length);
  }
  return { final: incoming, advances, abandons };
}

describe("tournament simulation", () => {
  const anyN = fc.integer({ min: 2, max: 200 });

  it("conserves texts: n = survivors + resolved merges + 2 × abandonments", () => {
    fc.assert(
      fc.property(anyN, fc.integer(), (n, seed) => {
        const { final, advances, abandons } = simulate(n, seed);
        expect(final).toHaveLength(1);
        const survivors = final[0] ? 1 : 0;
        expect(n).toBe(survivors + advances + 2 * abandons);
      })
    );
  });

  it("emptiness always resolves: without abandonment there is a canonical text after exactly n-1 merges", () => {
    fc.assert(
      fc.property(anyN, fc.integer(), (n, seed) => {
        const { final, advances, abandons } = simulate(n, seed);
        if (abandons === 0) {
          expect(final[0]).not.toBeNull();
          expect(advances).toBe(n - 1);
        }
      })
    );
  });

  it("provenance is a tree: no draft appears twice in the final text", () => {
    fc.assert(
      fc.property(anyN, fc.integer(), (n, seed) => {
        const { final } = simulate(n, seed);
        if (!final[0]) return;
        for (let i = 0; i < n; i++) {
          const token = `<d${i}>`;
          const count = final[0].text.split(token).length - 1;
          expect(count).toBeLessThanOrEqual(1);
        }
      })
    );
  });

  it("is reproducible from its seed", () => {
    fc.assert(
      fc.property(anyN, fc.integer(), (n, seed) => {
        expect(simulate(n, seed)).toEqual(simulate(n, seed));
      })
    );
  });
});
