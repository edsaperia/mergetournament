/**
 * Who carries a locked merge forward (SPEC §4), in words a bearer can act on.
 * Mirrors resolveMerge in engine.ts: one pick alone is enough; a coin flip
 * decides only when the two picks differ or neither bearer picks.
 */

import type { Side } from "./engine";

export type CarrierPrefs = { A: Side | null; B: Side | null };

/** The carrier a lock-in would produce now, or "flip" if a coin flip would decide. */
export function carrierOutcome(prefs: CarrierPrefs): Side | "flip" {
  const { A: pA, B: pB } = prefs;
  if (pA !== null && (pB === null || pB === pA)) return pA;
  if (pB !== null && pA === null) return pB;
  return "flip";
}

/** One line for `mySide`'s view of the carrier choice: both picks and what they add up to. */
export function carrierLine(mySide: Side, names: { A: string; B: string }, prefs: CarrierPrefs): string {
  const theirSide: Side = mySide === "A" ? "B" : "A";
  const partner = names[theirSide];
  const mine = prefs[mySide];
  const theirs = prefs[theirSide];
  const outcome = carrierOutcome(prefs);

  if (mine === null && theirs === null) {
    return "No picks yet. One pick settles it; if neither of you picks, a coin flip chooses the carrier.";
  }
  const myPick = mine === mySide ? "You picked yourself" : `You picked ${partner}`;
  const theirPick = theirs === mySide ? `${partner} picked you` : `${partner} wants to carry it`;
  if (outcome === "flip") {
    return `${myPick}; ${theirPick}. Unless one of you changes, a coin flip chooses the carrier.`;
  }
  const carries = outcome === mySide ? "you carry it forward" : `${partner} carries it forward`;
  if (mine !== null && theirs !== null) return `You both agree: ${carries}.`;
  if (mine !== null) return `${myPick}. ${partner} hasn't picked, so ${carries} unless ${partner} picks differently.`;
  return `${theirPick}. That stands, so ${carries}, unless you pick differently.`;
}
