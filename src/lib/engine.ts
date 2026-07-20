/**
 * Tournament engine (SPEC §4, Phase 3): the per-merge lock-in state machine,
 * round-close backstop resolution, and idle-matching for byes and walkovers.
 *
 * Everything here is pure: state in, state out, with all randomness drawn
 * from an injected Rng so every outcome is reproducible from logged seeds.
 */

import { Slot } from "./bracket";
import { DomainError } from "./errors";
import { flip, Rng } from "./rng";

export type Side = "A" | "B";

// ---------------------------------------------------------------------------
// Lock-in state machine
// ---------------------------------------------------------------------------

export type LockState = "editing" | "proposed" | "locked";

export interface MergeSession {
  lock: LockState;
  /** Who pressed Propose Lock in, while `lock` is "proposed". */
  proposedBy: Side | null;
  workingText: string;
  /** Each bearer's preference for who carries the result forward. */
  bearerPref: { A: Side | null; B: Side | null };
  /** Whether each bearer has acted at all this round (edit, propose, confirm, keep-editing, select). */
  active: { A: boolean; B: boolean };
}

export function newSession(): MergeSession {
  return {
    lock: "editing",
    proposedBy: null,
    workingText: "",
    bearerPref: { A: null, B: null },
    active: { A: false, B: false },
  };
}

export type MergeAction =
  | { type: "edit"; side: Side; text: string }
  | { type: "propose"; side: Side }
  | { type: "confirm"; side: Side }
  | { type: "keepEditing"; side: Side }
  | { type: "selectBearer"; side: Side; pref: Side };

/** Apply one bearer action; throws on transitions the UI must never offer. */
export function applyAction(s: MergeSession, a: MergeAction): MergeSession {
  const touched = (next: Partial<MergeSession>): MergeSession => ({
    ...s,
    ...next,
    active: { ...s.active, [a.side]: true },
  });
  switch (a.type) {
    case "edit":
      if (s.lock !== "editing") throw new DomainError(`cannot edit while ${s.lock}`);
      return touched({ workingText: a.text });
    case "propose":
      if (s.lock !== "editing") throw new DomainError(`cannot propose while ${s.lock}`);
      return touched({ lock: "proposed", proposedBy: a.side });
    case "confirm":
      if (s.lock !== "proposed") throw new DomainError(`cannot confirm while ${s.lock}`);
      if (a.side === s.proposedBy) throw new DomainError("proposer cannot confirm their own proposal");
      return touched({ lock: "locked", proposedBy: null });
    case "keepEditing":
      if (s.lock !== "proposed") throw new DomainError(`cannot keep-editing while ${s.lock}`);
      if (a.side === s.proposedBy) throw new DomainError("only the other bearer may keep editing");
      return touched({ lock: "editing", proposedBy: null });
    case "selectBearer":
      return touched({ bearerPref: { ...s.bearerPref, [a.side]: a.pref } });
  }
}

// ---------------------------------------------------------------------------
// Round-close resolution (the backstop)
// ---------------------------------------------------------------------------

export type ResolutionKind =
  | "AGREED"
  | "BEARER_FLIP"
  | "BACKSTOP_FLIP"
  | "ACTIVE_ADVANCE"
  | "ABANDONED";

export interface MergeInput {
  text: string;
  bearer: string;
}

export interface FlipRecord {
  purpose: "bearer" | "backstop" | "adhoc-position";
  outcome: 0 | 1;
}

export interface ResolvedMerge {
  kind: ResolutionKind;
  /**
   * What advances, or null if the slot empties (ABANDONED). `source` says
   * whether `text` is the session's working text (new content) or one of the
   * inputs advancing intact — callers persist accordingly.
   */
  advancing: { source: "working" | "input"; text: string; bearer: string } | null;
  flips: FlipRecord[];
}

/**
 * Resolve a merge with both inputs present, at round close (after the 60s
 * are-you-still-here window). `activeChoice` is the sole active bearer's pick
 * in the one-active case — null means they made no choice, which defaults to
 * their own input (SPEC §4: only consented texts or original inputs advance).
 */
export function resolveMerge(
  a: MergeInput,
  b: MergeInput,
  session: MergeSession,
  activeChoice: "working" | "input" | null,
  rng: Rng
): ResolvedMerge {
  const flips: FlipRecord[] = [];

  if (session.lock === "locked") {
    const { A: pA, B: pB } = session.bearerPref;
    let side: Side;
    let kind: ResolutionKind = "AGREED";
    if (pA !== null && (pB === null || pB === pA)) side = pA;
    else if (pB !== null && pA === null) side = pB;
    else {
      const outcome = flip(rng);
      flips.push({ purpose: "bearer", outcome });
      side = outcome === 0 ? "A" : "B";
      kind = "BEARER_FLIP";
    }
    return {
      kind,
      advancing: { source: "working", text: session.workingText, bearer: side === "A" ? a.bearer : b.bearer },
      flips,
    };
  }

  const { A: activeA, B: activeB } = session.active;
  if (activeA && activeB) {
    const outcome = flip(rng);
    flips.push({ purpose: "backstop", outcome });
    const winner = outcome === 0 ? a : b;
    return { kind: "BACKSTOP_FLIP", advancing: { source: "input", ...winner }, flips };
  }
  if (activeA || activeB) {
    const own = activeA ? a : b;
    const workingUsable = activeChoice === "working" && session.workingText.trim() !== "";
    return {
      kind: "ACTIVE_ADVANCE",
      advancing: {
        source: workingUsable ? "working" : "input",
        text: workingUsable ? session.workingText : own.text,
        bearer: own.bearer,
      },
      flips,
    };
  }
  return { kind: "ABANDONED", advancing: null, flips };
}

// ---------------------------------------------------------------------------
// Round planning: scheduled merges, idle-matching, walkovers, empties
// ---------------------------------------------------------------------------

/** A text occupying an incoming position of a round. */
export interface TextEntry {
  text: string;
  bearer: string;
}

/**
 * An ad-hoc merge between two idle texts (SPEC §4, Byes and Walkovers).
 * Slots are identified by their index within the round; the result takes one
 * input's bracket position (chosen by coin flip), the other propagates empty.
 */
export interface AdHocMerge {
  slotA: number;
  slotB: number;
  a: MergeInput;
  b: MergeInput;
  resultSlot: number;
  vacatedSlot: number;
  flip: FlipRecord;
}

export interface RoundPlan {
  /** Scheduled merges to run, keyed by slot index. */
  merges: Map<number, { a: MergeInput; b: MergeInput }>;
  /** Ad-hoc merges pairing this round's idle texts; run alongside the scheduled ones. */
  adHoc: AdHocMerge[];
  /** A lone idle text (bye or walkover) standing over, keyed by slot index. */
  standOver: Map<number, TextEntry>;
}

/**
 * Plan a round. A text is idle in this round if it holds a bye slot or
 * arrives by walkover (its merge slot's other feeder is empty). Two or more
 * idles are paired into ad-hoc merges in slot order; an odd remainder stands
 * over. Draws from `rng` only for ad-hoc result positions.
 */
export function planRound(
  slots: readonly Slot[],
  incoming: readonly (TextEntry | null)[],
  rng: Rng
): RoundPlan {
  const merges = new Map<number, { a: MergeInput; b: MergeInput }>();
  const idle: Array<{ slot: number; entry: TextEntry }> = [];

  for (const slot of slots) {
    if (slot.kind === "bye") {
      const t = incoming[slot.feeders[0]];
      if (t) idle.push({ slot: slot.index, entry: t });
      continue;
    }
    const [fa, fb] = slot.feeders as [number, number];
    const a = incoming[fa];
    const b = incoming[fb];
    if (a && b) merges.set(slot.index, { a: { ...a }, b: { ...b } });
    else if (a ?? b) idle.push({ slot: slot.index, entry: (a ?? b)! });
    // both empty: emptiness propagates; nothing to plan
  }

  const adHoc: AdHocMerge[] = [];
  let k = 0;
  for (; k + 1 < idle.length; k += 2) {
    const x = idle[k];
    const y = idle[k + 1];
    const outcome = flip(rng);
    adHoc.push({
      slotA: x.slot,
      slotB: y.slot,
      a: { ...x.entry },
      b: { ...y.entry },
      resultSlot: outcome === 0 ? x.slot : y.slot,
      vacatedSlot: outcome === 0 ? y.slot : x.slot,
      flip: { purpose: "adhoc-position", outcome },
    });
  }
  const standOver = new Map<number, TextEntry>();
  if (k < idle.length) standOver.set(idle[k].slot, idle[k].entry);

  return { merges, adHoc, standOver };
}

/**
 * Assemble the next round's incoming positions from a completed round.
 * `resolutions` must cover every scheduled merge (by slot index) and every
 * ad-hoc merge (by its resultSlot index).
 */
export function completeRound(
  slots: readonly Slot[],
  plan: RoundPlan,
  resolutions: ReadonlyMap<number, ResolvedMerge>
): (TextEntry | null)[] {
  const vacated = new Set(plan.adHoc.map((m) => m.vacatedSlot));
  const adHocResults = new Set(plan.adHoc.map((m) => m.resultSlot));

  return slots.map((slot) => {
    const i = slot.index;
    if (vacated.has(i)) return null;
    if (plan.merges.has(i) || adHocResults.has(i)) {
      const r = resolutions.get(i);
      if (!r) throw new Error(`missing resolution for slot ${slot.round}:${i}`);
      return r.advancing ? { text: r.advancing.text, bearer: r.advancing.bearer } : null;
    }
    const stand = plan.standOver.get(i);
    return stand ? { ...stand } : null;
  });
}
