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
      return "agreed · coin flip chose who goes into the next round";
    case "backstop_flip":
      return "no agreement · coin flip between the inputs";
    case "active_advance":
      return "only one player took part";
    case "abandoned":
      return "abandoned · neither player took part";
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
  /** Each player's pick for who goes into the next round, when known: says why a coin flip chose. */
  bearerPrefA?: "A" | "B" | null;
  bearerPrefB?: "A" | "B" | null;
  /** Each player's last Accept ("working") or Reject ("input") in the decision-window, when known. */
  activeChoiceA?: "working" | "input" | null;
  activeChoiceB?: "working" | "input" | null;
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
  const goes = finalRound ? "becomes the final text" : "goes into the next round";
  switch (m.resolution) {
    case "agreed":
      return finalRound
        ? "Agreed: the merged text is the tournament's final text."
        : `Agreed: ${carrier} goes into the next round with the merged text.`;
    case "bearer_flip": {
      const [pA, pB] = [m.bearerPrefA, m.bearerPrefB];
      if (pA === null && pB === null) {
        return `Agreed. Neither ${nameOf(m.bearerAId)} nor ${nameOf(m.bearerBId)} picked who goes into the next round, so a coin flip chose ${carrier}.`;
      }
      if (pA && pB && pA !== pB) {
        return `Agreed. The picks for who goes into the next round differed, so a coin flip chose ${carrier}.`;
      }
      return `Agreed. The picks for who goes into the next round differed or were missing, so a coin flip chose ${carrier}.`;
    }
    case "backstop_flip":
      return `No agreement, so a coin flip between the inputs: ${inputOwner}'s ${finalRound ? "input" : "text"} ${goes} unchanged.`;
    case "active_advance": {
      if (advanced === "merged") return `Only ${carrier} took part, so the merged text ${carrier} accepted ${goes}.`;
      // Not accepting, or accepting a blank merged text: either way the input goes on.
      const choice = m.advancingBearerId === m.bearerAId ? m.activeChoiceA : m.activeChoiceB;
      if (choice === "input") return `${carrier} rejected the merge, so ${carrier}'s input ${goes} unchanged.`;
      if (choice === "working") {
        return `Only ${carrier} took part, and the merge ${carrier} accepted was empty, so ${carrier}'s input ${goes} unchanged.`;
      }
      return `Only ${carrier} took part, and there was no accepted merged text, so ${carrier}'s input ${goes} unchanged.`;
    }
    case "abandoned":
      return finalRound
        ? "Neither player took part, so this merge is abandoned and nothing from it becomes the final text."
        : "Neither player took part, so this merge is abandoned and nothing from it goes into the next round.";
    case "walkover":
      return `Walkover: ${carrier}'s text ${goes}.`;
    default:
      return "Resolved.";
  }
}

/**
 * The "what now" line for one bearer of a resolved merge: whether they carry
 * on, and if not, why (their partner carries, they were away, or the merge
 * was abandoned) and what they can still do. Once the tournament is over it
 * looks back, in the past tense, and sends nobody off to find a partner.
 */
export function whatNow(
  m: ResolvedMergeView,
  meId: string,
  nameOf: (id: string | null) => string,
  roundNo: number,
  finalRound: boolean,
  /** The tournament has completed: nothing left to watch live. */
  tournamentOver = false,
  /**
   * Where the text that went on landed, once the next round is drawn up:
   * with no partner there, it stands over (or, in the final, becomes the final text).
   */
  next: "merge" | "standsOver" | "standsOverFinal" | null = null
): string {
  const done = tournamentOver
    ? "The tournament is over; read the final text or look back through the bracket."
    : "You're done merging; watch the other merges or join the chat.";
  const goesOn = tournamentOver ? "went into the next round" : "goes into the next round";
  if (m.resolution === "abandoned" || !m.resultTextId) {
    const went = finalRound ? (tournamentOver ? "became the final text" : "becomes the final text") : goesOn;
    return `Neither of you took part, so neither text ${went}. ${done}`;
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
    if (next === "standsOver" || next === "standsOverFinal") {
      const final = next === "standsOverFinal";
      const there = final ? "the final" : `round ${roundNo + 1}`;
      if (tournamentOver) {
        const then = final ? "became the final text" : `stood over into round ${roundNo + 2}`;
        return `You went into ${there} with this text, and it had no partner there, so it ${then}. ${done}`;
      }
      const then = final ? "becomes the final text" : `stands over into round ${roundNo + 2}`;
      return `You go into ${there} with this text, but it has no partner there, so it ${then}. Meanwhile, read the texts and join the chat.`;
    }
    return tournamentOver
      ? `You went into round ${roundNo + 1} with this text. ${done}`
      : `You go into round ${roundNo + 1} with this text. In the break, read the texts and find your next partner.`;
  }
  if (m.resolution === "active_advance") {
    const what = advancedFrom(m) === "merged" ? "the merged text they accepted" : "their own input";
    return `While you were away, only ${carrier} took part, so ${carrier} ${goesOn} with ${what}. ${done}`;
  }
  return `${carrier} ${goesOn} with this text. ${done}`;
}

/**
 * The "what now" line for a player whose text has no partner in a round and
 * goes on without a merge: a bye, or a text standing over (its partner's
 * side came up empty). In the final round it becomes the final text.
 */
export function sittingOutLine(opts: {
  /** A bye slot in the bracket, or a text standing over. */
  kind: "bye" | "standOver";
  roundNo: number;
  finalRound: boolean;
  /** The text is still the player's own draft (they haven't merged yet). */
  isDraft: boolean;
  tournamentOver: boolean;
}): string {
  const { kind, roundNo, finalRound, isDraft, tournamentOver: over } = opts;
  const text = isDraft ? "draft" : "text";
  const meanwhile = over
    ? "The tournament is over; read the final text or look back through the bracket."
    : "Meanwhile, read the texts and join the chat.";
  if (finalRound) {
    return over
      ? `Your ${text} had no partner in the final, so it became the final text. Read it or look back through the bracket.`
      : `Your ${text} has no partner in the final, so it becomes the final text.`;
  }
  const next = roundNo + 1;
  if (kind === "bye") {
    return over
      ? `You had a bye in round ${roundNo}: your ${text} went into round ${next} unchanged. ${meanwhile}`
      : `You have a bye in round ${roundNo}: your ${text} goes into round ${next} unchanged. ${meanwhile}`;
  }
  return over
    ? `Your ${text} had no partner in round ${roundNo}, so it stood over into round ${next} unchanged. ${meanwhile}`
    : `Your ${text} has no partner in round ${roundNo}, so it stands over into round ${next} unchanged. ${meanwhile}`;
}
