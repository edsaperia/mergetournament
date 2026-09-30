/**
 * Plain words for how a merge resolved (SPEC §4), shared by the export, the
 * bracket, the workspace and the chat. Players never see the enum names
 * (agreed, bearer_flip, backstop_flip, active_advance, abandoned, walkover).
 */

export type Resolution = "agreed" | "bearer_flip" | "backstop_flip" | "active_advance" | "abandoned" | "walkover";

/** A short label, for bracket cards and the provenance export. */
export function resolutionLabel(r: string | null | undefined): string {
  switch (r) {
    case "agreed":
      return "agreed";
    case "bearer_flip":
      return "agreed · coin flip chose the carrier";
    case "backstop_flip":
      return "no agreement · coin flip between the inputs";
    case "active_advance":
      return "only one bearer took part";
    case "abandoned":
      return "abandoned · neither bearer took part";
    case "walkover":
      return "walkover";
    default:
      return "not resolved yet";
  }
}

export interface ResolvedMergeView {
  resolution: string | null;
  bearerAId: string | null;
  bearerBId: string | null;
  textAId: string | null;
  textBId: string | null;
  resultTextId: string | null;
  advancingBearerId: string | null;
}

/** What advanced from a resolved merge: the merged text, one input unchanged, or nothing. */
export function advancedFrom(m: ResolvedMergeView): "merged" | "A" | "B" | null {
  if (!m.resultTextId) return null;
  if (m.resultTextId === m.textAId) return "A";
  if (m.resultTextId === m.textBId) return "B";
  return "merged";
}

/**
 * One plain sentence saying how a merge resolved, with the bearers' names:
 * for the workspace banner and the merge chat. In the final round the
 * advancing text is the tournament's final text rather than carried on.
 */
export function resolutionSentence(m: ResolvedMergeView, nameOf: (id: string | null) => string, finalRound: boolean): string {
  const carrier = nameOf(m.advancingBearerId);
  const advanced = advancedFrom(m);
  const inputOwner = advanced === "A" ? nameOf(m.bearerAId) : advanced === "B" ? nameOf(m.bearerBId) : carrier;
  const goes = finalRound ? "becomes the final text" : "advances";
  switch (m.resolution) {
    case "agreed":
      return finalRound
        ? "Agreed: the merged text is the tournament's final text."
        : `Agreed: ${carrier} carries the merged text forward.`;
    case "bearer_flip":
      return `Agreed. The carrier picks differed or were missing, so a coin flip chose ${carrier} to carry the merged text forward.`;
    case "backstop_flip":
      return `No agreement, so a coin flip between the inputs: ${inputOwner}'s input ${goes} unchanged.`;
    case "active_advance":
      return advanced === "merged"
        ? `Only ${carrier} took part, so the merged text ${carrier} accepted ${goes}.`
        : `Only ${carrier} took part and didn't accept the merge, so ${carrier}'s input ${goes} unchanged.`;
    case "abandoned":
      return "Neither bearer took part, so this merge is abandoned and nothing advances from it.";
    case "walkover":
      return `Walkover: ${carrier}'s text ${goes}.`;
    default:
      return "Resolved.";
  }
}

/**
 * The "what now" line for one bearer of a resolved merge: whether they carry
 * on, and if not, why (their partner carries, they were away, or the merge
 * was abandoned) and what they can still do.
 */
export function whatNow(
  m: ResolvedMergeView,
  meId: string,
  nameOf: (id: string | null) => string,
  roundNo: number,
  finalRound: boolean
): string {
  const done = "You're done merging; watch the other merges or join the chat.";
  if (m.resolution === "abandoned" || !m.resultTextId) {
    return `Neither of you took part, so neither text goes on. ${done}`;
  }
  const carrier = nameOf(m.advancingBearerId);
  if (finalRound) {
    // Away in the final: say what their partner's text became.
    if (m.resolution === "active_advance" && m.advancingBearerId !== meId) {
      const what = advancedFrom(m) === "merged" ? "the merged text they accepted" : "their own input";
      return `While you were away, only ${carrier} took part, so ${what} became the final text. Read it or join the chat.`;
    }
    return "That was the final, so you're done merging. Read the final text or join the chat.";
  }
  if (m.advancingBearerId === meId) {
    return `You carry this into round ${roundNo + 1}. In the break, read the texts and find your next partner.`;
  }
  if (m.resolution === "active_advance") {
    const what = advancedFrom(m) === "merged" ? "the merged text they accepted" : "their own input";
    return `While you were away, only ${carrier} took part, so ${what} goes on with ${carrier}. ${done}`;
  }
  return `${carrier} carries this forward. ${done}`;
}
