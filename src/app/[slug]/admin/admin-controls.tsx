"use client";

import { useActionState } from "react";
import type { ActionState } from "../../../server/actions";
import { ActionStatus } from "../../action-status";
import { Button } from "../../ui";

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
  return (
    <form
      action={dispatch}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className="inline-flex flex-col gap-1"
    >
      <Button
        variant={primary ? "primary" : "secondary"}
        size={small ? "sm" : "lg"}
        disabled={pending || disabled}
        title={disabled ? disabledReason : undefined}
      >
        {pending ? "…" : label}
      </Button>
      <ActionStatus state={state} />
    </form>
  );
}
