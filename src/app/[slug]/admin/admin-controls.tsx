"use client";

import { useActionState } from "react";
import type { ActionState } from "../../../server/actions";
import { ActionStatus } from "../../action-status";

const initial: ActionState = { ok: true, message: "" };

/** One admin lifecycle button (Start Tournament / Start Round 1 / Pause / Resume / Delete) with feedback. */
export function ControlButton({
  action,
  label,
  confirmText,
  primary = true,
}: {
  action: () => Promise<ActionState>;
  label: string;
  confirmText?: string;
  primary?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(async () => action(), initial);
  return (
    <form
      action={dispatch}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className="inline-flex flex-col gap-2"
    >
      <button
        disabled={pending}
        className={
          primary
            ? "rounded-lg bg-accent px-5 py-3 font-medium text-accent-ink hover:bg-accent-soft disabled:opacity-50"
            : "rounded-lg border border-line px-5 py-3 font-medium disabled:opacity-50"
        }
      >
        {pending ? "…" : label}
      </button>
      <ActionStatus state={state} />
    </form>
  );
}
