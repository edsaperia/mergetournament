"use client";

import { useActionState } from "react";
import { workspaceAction, type ActionState } from "../../../../server/actions";
import type { WorkspaceAction } from "../../../../services/runtime-service";
import { ActionStatus } from "../../../action-status";
import { btnPrimary as btn, btnSecondary } from "../../../ui";

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
      {lock === "proposed" && (
        <p className="text-sm text-amber-600">
          {iProposed ? `You proposed to lock in — waiting for ${partnerName}` : `${partnerName} proposed to lock in`}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {lock === "editing" && (
          <button className={btn} name="intent" value="propose" disabled={pending}>
            Propose lock-in
          </button>
        )}
        {theyProposed && (
          <>
            <button className={btn} name="intent" value="confirm" disabled={pending}>
              Confirm lock-in
            </button>
            <button className={btnSecondary} name="intent" value="keepEditing" disabled={pending}>
              Keep editing
            </button>
          </>
        )}
      </div>

      <fieldset className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <legend className="px-1 text-neutral-500">Who carries the result forward?</legend>
        <div className="flex gap-2">
          <button
            className={myPref === mySide ? btn : btnSecondary}
            name="intent"
            value="selectBearer"
            onClick={(e) => {
              ((e.currentTarget.form!).elements.namedItem("pref") as HTMLInputElement).value = "me";
            }}
            disabled={pending}
          >
            Me
          </button>
          <button
            className={myPref !== null && myPref !== mySide ? btn : btnSecondary}
            name="intent"
            value="selectBearer"
            onClick={(e) => {
              ((e.currentTarget.form!).elements.namedItem("pref") as HTMLInputElement).value = "partner";
            }}
            disabled={pending}
          >
            {partnerName}
          </button>
          <input type="hidden" name="pref" defaultValue="me" />
        </div>
      </fieldset>
      <ActionStatus state={state} />
    </form>
  );
}
