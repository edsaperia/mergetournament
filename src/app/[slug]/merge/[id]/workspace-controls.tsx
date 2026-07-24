"use client";

import { useActionState } from "react";
import { workspaceAction, type ActionState } from "../../../../server/actions";
import type { WorkspaceAction } from "../../../../services/runtime-service";
import { ActionStatus } from "../../../action-status";
import { Button } from "../../../ui";

const initial: ActionState = { ok: true, message: "" };

/** Lock-in and bearer-selection controls; the text itself lives in the collaborative editor. */
export function WorkspaceControls({
  slug,
  mergeId,
  mySide,
  partnerName,
  lock,
  proposedBy,
  myPref,
}: {
  slug: string;
  mergeId: string;
  mySide: "A" | "B";
  partnerName: string;
  lock: "editing" | "proposed";
  proposedBy: "A" | "B" | null;
  myPref: "A" | "B" | null;
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
              : { type: "selectBearer", pref: formData.get("pref") === "me" ? mySide : mySide === "A" ? "B" : "A" };
      return workspaceAction(slug, mergeId, action);
    },
    initial
  );

  const iProposed = lock === "proposed" && proposedBy === mySide;
  const theyProposed = lock === "proposed" && proposedBy !== mySide;

  return (
    <form action={dispatch} className="mt-3 flex flex-col gap-3">
      {/* Bearer choice first: settle it before lock-in, since an unsettled
          choice is what triggers a coin flip at confirmation. */}
      <fieldset className="rounded-md border border-edge p-3 text-sm">
        <legend className="px-1 text-muted">Who carries the result forward? (unsettled = coin flip)</legend>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={myPref === mySide ? "primary" : "secondary"}
            name="intent"
            value="selectBearer"
            onClick={(e) => {
              ((e.currentTarget.form!).elements.namedItem("pref") as HTMLInputElement).value = "me";
            }}
            disabled={pending}
          >
            Me
          </Button>
          <Button
            variant={myPref !== null && myPref !== mySide ? "primary" : "secondary"}
            name="intent"
            value="selectBearer"
            onClick={(e) => {
              ((e.currentTarget.form!).elements.namedItem("pref") as HTMLInputElement).value = "partner";
            }}
            disabled={pending}
          >
            {partnerName}
          </Button>
          <input type="hidden" name="pref" defaultValue="me" />
        </div>
      </fieldset>

      {lock === "proposed" && (
        <p className="text-sm text-amber-600">
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
