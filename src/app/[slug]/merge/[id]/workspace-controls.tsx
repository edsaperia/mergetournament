"use client";

import { useActionState, useState } from "react";
import { workspaceAction, type ActionState } from "../../../../server/actions";
import type { WorkspaceAction } from "../../../../services/runtime-service";
import { countWords } from "../../../../lib/text";
import { ActionStatus } from "../../../action-status";

const initial: ActionState = { ok: true, message: "" };

export function WorkspaceControls({
  slug,
  mergeId,
  mySide,
  partnerName,
  workingText,
  lock,
  proposedBy,
  myPref,
}: {
  slug: string;
  mergeId: string;
  mySide: "A" | "B";
  partnerName: string;
  workingText: string;
  lock: "editing" | "proposed";
  proposedBy: "A" | "B" | null;
  myPref: "A" | "B" | null;
}) {
  const [body, setBody] = useState(workingText);
  const [state, dispatch, pending] = useActionState(
    async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
      const intent = String(formData.get("intent"));
      const action: WorkspaceAction =
        intent === "save"
          ? { type: "edit", text: String(formData.get("body") ?? "") }
          : intent === "propose"
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
  const btn =
    "rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900";
  const btnSecondary =
    "rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 border border-neutral-300 dark:border-neutral-700";

  return (
    <form action={dispatch} className="flex flex-col gap-3">
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        readOnly={lock !== "editing"}
        className={`min-h-[20rem] w-full rounded-md border p-3 font-mono text-sm leading-relaxed dark:bg-neutral-900 ${
          lock !== "editing" ? "border-amber-400 bg-amber-50/50 dark:bg-neutral-950" : "border-neutral-300 dark:border-neutral-700"
        }`}
      />
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span className="tabular-nums">{countWords(body)} words</span>
        {lock === "proposed" && (
          <span className="text-amber-600">
            {iProposed ? "You proposed to lock in — waiting for " + partnerName : `${partnerName} proposed to lock in`}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {lock === "editing" && (
          <>
            <button className={btn} name="intent" value="save" disabled={pending}>
              Save working text
            </button>
            <button className={btnSecondary} name="intent" value="propose" disabled={pending}>
              Propose lock-in
            </button>
          </>
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

      <fieldset className="mt-2 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <legend className="px-1 text-neutral-500">Who carries the result forward?</legend>
        <div className="flex gap-2">
          <button
            className={`${myPref === mySide ? btn : btnSecondary}`}
            name="intent"
            value="selectBearer"
            data-pref="me"
            onClick={(e) => {
              const form = e.currentTarget.form!;
              (form.elements.namedItem("pref") as HTMLInputElement).value = "me";
            }}
            disabled={pending}
          >
            Me
          </button>
          <button
            className={`${myPref !== null && myPref !== mySide ? btn : btnSecondary}`}
            name="intent"
            value="selectBearer"
            onClick={(e) => {
              const form = e.currentTarget.form!;
              (form.elements.namedItem("pref") as HTMLInputElement).value = "partner";
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
