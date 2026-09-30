"use client";

import { useActionState } from "react";
import { workspaceAction, type ActionState } from "../../../../server/actions";
import type { WorkspaceAction } from "../../../../services/runtime-service";
import { carrierLine } from "../../../../lib/carrier";
import { ActionStatus } from "../../../action-status";
import { Button } from "../../../ui";

const initial: ActionState = { ok: true, message: "" };

/** Lock-in and bearer-selection controls; the text itself lives in the collaborative editor. */
export function WorkspaceControls({
  slug,
  mergeId,
  mySide,
  names,
  lock,
  proposedBy,
  myPref,
  partnerPref,
  iAmActive,
  partnerActive,
  finalRound,
}: {
  slug: string;
  mergeId: string;
  mySide: "A" | "B";
  names: { A: string; B: string };
  lock: "editing" | "proposed";
  proposedBy: "A" | "B" | null;
  myPref: "A" | "B" | null;
  partnerPref: "A" | "B" | null;
  /** Whether each player has taken part yet this round: with one silent, the picks don't decide. */
  iAmActive: boolean;
  partnerActive: boolean;
  finalRound: boolean;
}) {
  const [state, dispatch, pending] = useActionState(
    async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
      const intent = String(formData.get("intent"));
      const action: WorkspaceAction =
        intent === "propose"
          ? { type: "propose" }
          : intent === "confirm"
            ? { type: "confirm" }
            : intent === "keepEditing"
              ? { type: "keepEditing" }
              : { type: "selectBearer", pref: intent === "bearerA" ? "A" : "B" };
      return workspaceAction(slug, mergeId, action);
    },
    initial
  );

  const partnerName = names[mySide === "A" ? "B" : "A"];
  const iProposed = lock === "proposed" && proposedBy === mySide;
  const theyProposed = lock === "proposed" && proposedBy !== mySide;

  return (
    <form action={dispatch} className="mt-3 flex flex-col gap-3">
      {finalRound && (
        <p className="text-sm text-muted">
          This is the final round: the text you lock in becomes the final text.
        </p>
      )}
      {/* Bearer choice first: settle it before lock-in, since picks that
          differ (or no pick at all) are what trigger a coin flip at
          confirmation. Absent in the final round — there is no next round to
          carry the result into. */}
      {!finalRound && (
        <fieldset className="rounded-md border border-edge p-3 text-sm">
          <legend className="px-1 text-muted">Who goes into the next round?</legend>
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
          <p className="mt-2 text-xs text-muted">
            {carrierLine(mySide, names, mySide === "A" ? { A: myPref, B: partnerPref } : { A: partnerPref, B: myPref }, {
              iAmActive,
              partnerActive,
              window: false,
            })}
          </p>
        </fieldset>
      )}

      {lock === "proposed" && (
        <p className="text-sm text-warn">
          {iProposed ? `You proposed to lock in — waiting for ${partnerName}` : `${partnerName} proposed to lock in`}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {lock === "editing" && (
          <Button name="intent" value="propose" disabled={pending}>
            Propose lock-in
          </Button>
        )}
        {theyProposed && (
          <>
            <Button name="intent" value="confirm" disabled={pending}>
              Confirm lock-in
            </Button>
            <Button variant="secondary" name="intent" value="keepEditing" disabled={pending}>
              Keep editing
            </Button>
          </>
        )}
      </div>
      <ActionStatus state={state} />
    </form>
  );
}
