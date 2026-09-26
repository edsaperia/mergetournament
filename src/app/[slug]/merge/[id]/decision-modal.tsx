"use client";

import { useActionState, useState } from "react";
import { countWords } from "../../../../lib/text";
import { workspaceAction, type ActionState } from "../../../../server/actions";
import type { WorkspaceAction } from "../../../../services/runtime-service";
import { ActionStatus } from "../../../action-status";
import { Countdown } from "../../../live";
import { Modal } from "../../../modal";
import { NumberedText } from "../../../numbered-text";
import { Button } from "../../../ui";

const initial: ActionState = { ok: true, message: "" };

/** Lines of the frozen text the confirmation strip shows from each end. */
const STRIP_HEAD = 3;
const STRIP_TAIL = 3;

/**
 * The decision modal (SPEC §4, the decision window): once the clock expires
 * the text is frozen, and each bearer of an unfinished merge gets this for the
 * window's 60 seconds — accept or reject the merge, choose who carries it.
 * Any press also counts as presence. Not dismissible: the system removes it
 * when the merge resolves or the window ends.
 */
export function DecisionModal({
  slug,
  mergeId,
  mySide,
  names,
  proposedBy,
  myVote,
  myPref,
  iAmActive,
  partnerActive,
  finalRound,
  workingText,
  remainingS,
}: {
  slug: string;
  mergeId: string;
  mySide: "A" | "B";
  names: { A: string; B: string };
  /** The one accept vote cast so far, if any. */
  proposedBy: "A" | "B" | null;
  /** My last pressed window vote (working = Accept, input = Reject), if any. */
  myVote: "working" | "input" | null;
  myPref: "A" | "B" | null;
  iAmActive: boolean;
  partnerActive: boolean;
  finalRound: boolean;
  workingText: string;
  remainingS: number;
}) {
  const [state, dispatch, pending] = useActionState(
    async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
      const intent = String(formData.get("intent"));
      const action: WorkspaceAction =
        intent === "accept"
          ? { type: "accept" }
          : intent === "reject"
            ? { type: "reject" }
            : { type: "selectBearer", pref: intent === "bearerA" ? "A" : "B" };
      return workspaceAction(slug, mergeId, action);
    },
    initial
  );

  const [showAll, setShowAll] = useState(false);
  const partner = names[mySide === "A" ? "B" : "A"];
  const iAccepted = proposedBy === mySide;
  const partnerAccepted = proposedBy !== null && proposedBy !== mySide;
  const blank = workingText.trim() === "";
  const lines = workingText.split("\n");
  // Confirmation strip: the modal confirms which text, it isn't for rereading.
  const excerpt = !showAll && lines.length > STRIP_HEAD + STRIP_TAIL + 2;
  const rules = partnerActive
    ? `Both accept: ${finalRound ? "it becomes the canonical text" : "it locks in"}. Either rejects: a coin flip ` +
      "picks one input text to advance unchanged. No choice counts as rejecting."
    : `If ${partner} doesn't respond, Accept advances this merge and Reject advances your own input. ` +
      "No choice counts as rejecting.";

  return (
    // Header and footer stay put; only the middle scrolls, so the buttons
    // are always in reach however long the text or small the screen.
    <Modal label="Time is up — decide on the merge" className="flex max-w-2xl flex-col">
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-2 border-b border-edge px-5 py-4">
        <p className="text-xl font-bold">Time is up — the text is frozen</p>
        <Countdown remainingS={remainingS} className="text-2xl font-bold text-warn" dangerAtS={15} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {!iAmActive && <p className="font-semibold text-warn">Are you still here? Any button below counts.</p>}
        <p className="text-sm text-muted">
          The merge you would accept · {countWords(workingText)} words · {lines.length} lines
        </p>
        <div className="rounded-md border border-edge p-3">
          {blank ? (
            <p className="text-faint">(blank)</p>
          ) : excerpt ? (
            <>
              <NumberedText body={lines.slice(0, STRIP_HEAD).join("\n")} />
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="my-1 w-full rounded-md py-1 text-center text-xs text-muted hover:bg-panel"
              >
                ⋯ show all {lines.length} lines ⋯
              </button>
              <NumberedText body={lines.slice(-STRIP_TAIL).join("\n")} firstLine={lines.length - STRIP_TAIL + 1} />
            </>
          ) : (
            <NumberedText body={workingText} />
          )}
        </div>
      </div>

      <form action={dispatch} className="flex shrink-0 flex-col gap-3 border-t border-edge bg-panel px-5 py-4">
        {!finalRound && (
          <fieldset className="rounded-md border border-edge p-3 text-sm">
            <legend className="px-1 text-muted">Who carries the result forward? (unsettled = coin flip)</legend>
            <div className="flex flex-wrap gap-2">
              {(["A", "B"] as const).map((s) => (
                <Button
                  key={s}
                  variant={myPref === s ? "primary" : "secondary"}
                  name="intent"
                  value={`bearer${s}`}
                  disabled={pending}
                >
                  {names[s]}
                </Button>
              ))}
            </div>
          </fieldset>
        )}

        {/* The rules sit with the buttons so they are never below the fold. */}
        <p className="text-xs text-muted">{rules}</p>
        {iAccepted && <p className="text-sm text-warn">You accepted — waiting for {partner}.</p>}
        {partnerAccepted && (
          <p className="text-sm text-warn">{`${partner} has accepted. Accept too and the merge locks in.`}</p>
        )}
        {/* Side by side at every width: a wrapped pair doubles the footer on a phone. */}
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button size="lg" variant={iAccepted ? "primary" : "secondary"} name="intent" value="accept" disabled={pending}>
            Accept the Merge
          </Button>
          <Button size="lg" variant={myVote === "input" && !iAccepted ? "primary" : "secondary"} name="intent" value="reject" disabled={pending}>
            Reject the Merge
          </Button>
        </div>
        <ActionStatus state={state} />
      </form>
    </Modal>
  );
}
