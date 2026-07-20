"use client";

import { useState, useTransition } from "react";
import { setDeadlineAction, type ActionState } from "../../../server/actions";
import { LocalTime } from "../../local-time";
import { btnPrimary, btnSecondary } from "../../ui";

/** Set, change, or clear the submission deadline (editable until publication). */
export function DeadlineEditor({ slug, deadlineIso }: { slug: string; deadlineIso: string | null }) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<ActionState>({ ok: true, message: "" });
  const [pending, startTransition] = useTransition();

  const apply = (local: string | null) => {
    startTransition(async () => {
      setStatus(await setDeadlineAction(slug, local, new Date().getTimezoneOffset()));
      setValue("");
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-edge p-3 text-sm">
      <p>
        <span className="font-medium">Submission deadline:</span>{" "}
        {deadlineIso ? (
          <LocalTime iso={deadlineIso} />
        ) : (
          <span className="text-muted">none — you close submissions by publishing the bracket</span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-md border border-line px-2 py-1.5"
          aria-label="New submission deadline"
        />
        <button type="button" className={btnPrimary} disabled={pending || !value} onClick={() => apply(value)}>
          {deadlineIso ? "Change deadline" : "Set deadline"}
        </button>
        {deadlineIso && (
          <button type="button" className={btnSecondary} disabled={pending} onClick={() => apply(null)}>
            Clear
          </button>
        )}
      </div>
      {status.message && (
        <p className={status.ok ? "text-muted" : "text-red-600"}>{status.message}</p>
      )}
    </div>
  );
}
