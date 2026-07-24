"use client";

import { useActionState } from "react";
import { workspaceAction, type ActionState } from "../../../../server/actions";
import { ActionStatus } from "../../../action-status";
import { Button } from "../../../ui";

const initial: ActionState = { ok: true, message: "" };

/** The are-you-still-here window (SPEC §4): presence and advance-choice controls. */
export function WindowControls({
  slug,
  mergeId,
  iAmActive,
  myChoice,
  partnerName,
}: {
  slug: string;
  mergeId: string;
  iAmActive: boolean;
  myChoice: "working" | "input" | null;
  partnerName: string;
}) {
  const [state, dispatch, pending] = useActionState(
    async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
      const intent = String(formData.get("intent"));
      return workspaceAction(
        slug,
        mergeId,
        intent === "stillHere"
          ? { type: "stillHere" }
          : { type: "chooseAdvance", choice: intent === "working" ? "working" : "input" }
      );
    },
    initial
  );

  return (
    <form action={dispatch} className="mt-3 flex flex-col gap-3 rounded-lg border-2 border-warn bg-warn-surface p-4">
      {!iAmActive ? (
        <>
          <p className="font-semibold">Time is up — are you still here?</p>
          <Button className="text-lg" name="intent" value="stillHere" disabled={pending}>
            YES!
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm">
            Time is up. If {partnerName} doesn&apos;t come back before the window
            closes, what should advance?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant={myChoice === "working" ? "primary" : "secondary"} name="intent" value="working" disabled={pending}>
              The working text
            </Button>
            <Button
              variant={myChoice === "input" || myChoice === null ? "primary" : "secondary"}
              name="intent"
              value="input"
              disabled={pending}
            >
              Your own input{myChoice === null && " (default)"}
            </Button>
          </div>
          <p className="text-xs text-muted">
            If {partnerName} returns and presses YES, a coin flip between the
            two input texts decides instead.
          </p>
        </>
      )}
      <ActionStatus state={state} />
    </form>
  );
}
