"use client";

import { useActionState } from "react";
import { sendTestInviteAction, type ActionState } from "../../../server/actions";
import { ActionStatus } from "../../action-status";

const initial: ActionState = { ok: true, message: "" };

/** Email the admin the invite exactly as participants will receive it. */
export function TestInviteButton({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(async () => sendTestInviteAction(slug), initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 border-t border-edge-faint pt-4">
      <button
        disabled={pending}
        className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:border-strong disabled:opacity-50"
      >
        {pending ? "Sending…" : "Email me a test invite"}
      </button>
      <span className="text-xs text-muted">
        see exactly what participants will receive, before you send the real ones
      </span>
      <ActionStatus state={state} />
    </form>
  );
}
