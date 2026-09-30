/**
 * The decision-modal's vote line (SPEC §4, the decision-window): where the
 * two votes stand and what the window's end will do if nobody changes, as
 * resolveMerge decides it. Votes can change until the window ends: Accept
 * after Reject counts, and Reject withdraws your own Accept.
 */

import type { Side } from "./engine";

export interface VoteView {
  mySide: Side;
  partner: string;
  /** The one accept-vote cast so far (a pre-expiry lock-in proposal counts). */
  proposedBy: Side | null;
  /** Last pressed votes: working = Accept, input = Reject. */
  myVote: "working" | "input" | null;
  partnerVote: "working" | "input" | null;
  iAmActive: boolean;
  partnerActive: boolean;
  /** The final round: an input left alone becomes the final text instead of going into the next round. */
  finalRound?: boolean;
}

const FLIP = "a coin flip between the inputs decides when the countdown ends";

export function voteLine(v: VoteView): string | null {
  const P = v.partner;
  const goes = v.finalRound ? "becomes the final text" : "goes into the next round";
  const iAccept = v.proposedBy === v.mySide;
  const theyAccept = v.proposedBy !== null && v.proposedBy !== v.mySide;
  const iReject = !iAccept && v.myVote === "input";
  const theyReject = !theyAccept && v.partnerVote === "input";

  if (iAccept && theyReject) return `${P} rejected the merge. Unless one of you changes your vote, ${FLIP}.`;
  if (iReject && theyAccept) return `You rejected; ${P} accepted. Unless one of you changes your vote, ${FLIP}.`;
  if (iReject && theyReject) return `You both rejected. Unless you both switch to Accept, ${FLIP}.`;
  if (theyReject) {
    return v.iAmActive
      ? `${P} rejected the merge. Unless ${P} switches to Accept and you accept too, ${FLIP}.`
      : `${P} rejected the merge. If you stay silent, ${P}'s input ${goes} unchanged; if you respond, it's a coin flip unless you both accept.`;
  }
  if (iReject) {
    return v.partnerActive
      ? `You rejected. Unless you switch to Accept and ${P} accepts too, ${FLIP}.`
      : `You rejected. If ${P} stays silent, your input ${goes} unchanged.`;
  }
  if (iAccept) return `You accepted — waiting for ${P}.`;
  if (theyAccept) return `${P} has accepted. Accept too and the merge locks in.`;
  return null;
}
