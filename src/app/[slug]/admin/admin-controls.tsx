"use client";

import { useActionState } from "react";
import type { ActionState } from "../../../server/actions";
import { ActionStatus } from "../../action-status";

const initial: ActionState = { ok: true, message: "" };

/** One admin lifecycle button (Publish / Begin / Pause / Resume) with feedback. */
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
            ? "rounded-lg bg-neutral-900 px-5 py-3 font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            : "rounded-lg border border-neutral-300 px-5 py-3 font-medium disabled:opacity-50 dark:border-neutral-700"
        }
      >
        {pending ? "…" : label}
      </button>
      <ActionStatus state={state} />
    </form>
  );
}
