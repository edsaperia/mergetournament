"use client";

import { useActionState } from "react";
import { workspaceAction, type ActionState } from "../../../../server/actions";
import type { WorkspaceAction } from "../../../../services/runtime-service";
import { ActionStatus } from "../../../action-status";
import { Countdown } from "../../../live";
import { Modal } from "../../../modal";
import { NumberedText } from "../../../numbered-text";
import { Button } from "../../../ui";

const initial: ActionState = { ok: true, message: "" };

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

  const partner = names[mySide === "A" ? "B" : "A"];
  const iAccepted = proposedBy === mySide;
  const partnerAccepted = proposedBy !== null && proposedBy !== mySide;
  const blank = workingText.trim() === "";

  return (
    <Modal label="Time is up — decide on the merge" className="flex max-w-2xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xl font-bold">Time is up — the text is frozen</p>
        <Countdown remainingS={remainingS} className="text-2xl font-bold text-warn" dangerAtS={15} />
      </div>
      {!iAmActive && <p className="font-semibold text-warn">Are you still here? Any button below counts.</p>}

      <div className="max-h-[30vh] overflow-y-auto rounded-md border border-edge p-3">
        {blank ? <p className="text-faint">(blank)</p> : <NumberedText body={workingText} />}
      </div>

      <form action={dispatch} className="flex flex-col gap-4">
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

        {iAccepted && <p className="text-sm text-warn">You accepted — waiting for {partner}.</p>}
        {partnerAccepted && (
          <p className="text-sm text-warn">{partner} has accepted. Accept too and the merge locks in.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="lg" variant={iAccepted ? "primary" : "secondary"} name="intent" value="accept" disabled={pending}>
            Accept the Merge
          </Button>
          <Button size="lg" variant={iAmActive && !iAccepted ? "primary" : "secondary"} name="intent" value="reject" disabled={pending}>
            Reject the Merge
          </Button>
        </div>
        <ActionStatus state={state} />
      </form>

      <div className="flex flex-col gap-1 text-xs text-muted">
        <p>
          If you both accept, the merge locks in{finalRound ? " and becomes the canonical text" : ""}. If
          one of you rejects, a coin flip picks one of the two input texts to advance unchanged.
        </p>
        {!partnerActive && (
          <p>
            {partner} hasn&apos;t been active this round. If they don&apos;t respond, your choice decides
            alone: accepting advances the merge, rejecting advances your own input.
          </p>
        )}
        <p>Not deciding counts as rejecting.</p>
      </div>
    </Modal>
  );
}
