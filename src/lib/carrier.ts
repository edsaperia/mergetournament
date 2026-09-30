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

/**
 * Who has taken part so far this round, and where: in the round itself the
 * picks count once the pair locks in; in the decision-window, once both accept.
 */
export interface CarrierContext {
  iAmActive: boolean;
  partnerActive: boolean;
  window: boolean;
}

/**
 * One line for `mySide`'s view of the carrier choice: both picks and what
 * they add up to. With `ctx` and exactly one player active, the picks don't
 * decide: if the silent one stays silent, resolveMerge sends the active one
 * on (with the merge they accepted, or their own input), so the line says that.
 */
export function carrierLine(
  mySide: Side,
  names: { A: string; B: string },
  prefs: CarrierPrefs,
  ctx?: CarrierContext
): string {
  const theirSide: Side = mySide === "A" ? "B" : "A";
  const partner = names[theirSide];
  const mine = prefs[mySide];
  const theirs = prefs[theirSide];
  const outcome = carrierOutcome(prefs);

  if (ctx && ctx.iAmActive !== ctx.partnerActive) {
    const bothAgree = ctx.window ? "you both accept" : "you both lock in";
    const when = ctx.window ? "" : " when time runs out";
    if (ctx.iAmActive) {
      const myPick = mine === null ? "" : mine === mySide ? "You picked yourself. " : `You picked ${partner}. `;
      return `${myPick}If ${partner} stays silent, you go into the next round${when}; the picks count only if ${bothAgree}.`;
    }
    const theirPick = theirs === null ? "" : theirs === mySide ? `${partner} picked you, but i` : `${partner} picked themselves. I`;
    return `${theirPick || "I"}f you stay silent, ${partner} goes into the next round${when}; the picks count only if ${bothAgree}.`;
  }

  if (mine === null && theirs === null) {
    return "No picks yet. One pick settles it; if neither of you picks, a coin flip decides who goes into the next round.";
  }
  const myPick = mine === mySide ? "You picked yourself" : `You picked ${partner}`;
  const theirPick = theirs === mySide ? `${partner} picked you` : `${partner} picked themselves`;
  if (outcome === "flip") {
    return `${myPick}; ${theirPick}. Unless one of you changes, a coin flip decides who goes into the next round.`;
  }
  const carries = outcome === mySide ? "you go into the next round" : `${partner} goes into the next round`;
  if (mine !== null && theirs !== null) return `You both agree: ${carries}.`;
  if (mine !== null) return `${myPick}. ${partner} hasn't picked, so ${carries} unless ${partner} picks differently.`;
  return `${theirPick}. That stands, so ${carries}, unless you pick differently.`;
}
