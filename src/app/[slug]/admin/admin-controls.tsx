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
  small = false,
  disabled = false,
  disabledReason,
}: {
  action: () => Promise<ActionState>;
  label: string;
  confirmText?: string;
  primary?: boolean;
  small?: boolean;
  disabled?: boolean;
  /** Tooltip explaining a disabled button (e.g. "close submissions first"). */
  disabledReason?: string;
}) {
  const [state, dispatch, pending] = useActionState(async () => action(), initial);
  const pad = small ? "rounded-md px-2.5 py-1.5 text-sm" : "rounded-lg px-5 py-3";
  return (
    <form
      action={dispatch}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className="inline-flex flex-col gap-1"
    >
      <button
        disabled={pending || disabled}
        title={disabled ? disabledReason : undefined}
        className={
          primary
            ? `${pad} bg-accent font-medium text-accent-ink hover:bg-accent-soft disabled:opacity-40`
            : `${pad} border border-line font-medium disabled:opacity-40`
        }
      >
        {pending ? "…" : label}
      </button>
      <ActionStatus state={state} />
    </form>
  );
}
