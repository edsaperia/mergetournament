import { describe, expect, it } from "vitest";
import { voteLine, type VoteView } from "./decision";
import { applyWindowAction, newSession, resolveMerge, type MergeSession } from "./engine";
import { mulberry32 } from "./rng";

const base: VoteView = {
  mySide: "A",
  partner: "Cleo",
  proposedBy: null,
  myVote: null,
  partnerVote: null,
  iAmActive: true,
  partnerActive: true,
};

describe("voteLine", () => {
  it("tells an accepting bearer that their partner rejected (the 30 Sep playtest)", () => {
    const line = voteLine({ ...base, proposedBy: "A", myVote: "working", partnerVote: "input" });
    expect(line).toBe(
      "Cleo rejected the merge. Unless one of you changes your vote, a coin flip between the inputs decides when the countdown ends."
    );
    expect(line).not.toContain("waiting for");
  });

  it("tells the rejecting bearer where things stand, not that the partner is waiting", () => {
    const line = voteLine({ ...base, mySide: "B", partner: "Ada", proposedBy: "A", myVote: "input", partnerVote: "working" });
    expect(line).toBe("You rejected; Ada accepted. Unless one of you changes your vote, a coin flip between the inputs decides when the countdown ends.");
  });

  it("matches the engine: votes stay changeable, and the claimed outcome is what resolveMerge does", () => {
    // Ada accepts, Cleo rejects: both active, no lock → a coin flip between the inputs.
    let s: MergeSession = newSession();
    s = applyWindowAction(s, { type: "accept", side: "A" });
    s = applyWindowAction(s, { type: "reject", side: "B" });
    expect(s.lock).toBe("proposed");
    const flip = resolveMerge({ text: "a", bearer: "ada" }, { text: "b", bearer: "cleo" }, s, null, mulberry32(3));
    expect(flip.kind).toBe("BACKSTOP_FLIP");
    // Cleo changes her mind: her Accept after a Reject locks the merge.
    expect(applyWindowAction(s, { type: "accept", side: "B" }).lock).toBe("locked");

    // Only Cleo took part, and rejected: her input advances unchanged.
    let solo = newSession();
    solo = applyWindowAction(solo, { type: "reject", side: "B" });
    const r = resolveMerge({ text: "a", bearer: "ada" }, { text: "b", bearer: "cleo" }, solo, null, mulberry32(3));
    expect(r.kind).toBe("ACTIVE_ADVANCE");
    expect(r.advancing?.text).toBe("b");
    expect(voteLine({ ...base, partnerVote: "input", iAmActive: false })).toBe(
      "Cleo rejected the merge. If you stay silent, Cleo's input goes into the next round unchanged; if you respond, it's a coin flip unless you both accept."
    );
  });

  it("keeps the plain waiting lines when nobody has rejected", () => {
    expect(voteLine({ ...base, proposedBy: "A" })).toBe("You accepted — waiting for Cleo.");
    expect(voteLine({ ...base, proposedBy: "B" })).toBe("Cleo has accepted. Accept too and the merge locks in.");
    expect(voteLine(base)).toBeNull();
  });
});
