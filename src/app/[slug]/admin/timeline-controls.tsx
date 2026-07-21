"use client";

import { useState, useTransition } from "react";
import { setDeadlineAction, updateSettingsAction, type ActionState } from "../../../server/actions";

/**
 * Compact controls that live inside timeline rows: schedule a time for a
 * stage, or edit the round/break lengths. Buttons for the "now" actions are
 * ControlButton (small) bound in the server component.
 */

const btnSm = "rounded-md border border-line px-2.5 py-1.5 text-sm font-medium hover:border-strong disabled:opacity-40";

function useStatus() {
  const [status, setStatus] = useState<ActionState>({ ok: true, message: "" });
  const [pending, startTransition] = useTransition();
  return {
    status,
    pending,
    run: (fn: () => Promise<ActionState>) => startTransition(async () => setStatus(await fn())),
  };
}

function StatusNote({ status }: { status: ActionState }) {
  if (!status.message) return null;
  return <span className={status.ok ? "text-xs text-muted" : "text-xs text-red-600"}>{status.message}</span>;
}

/** Set / change / clear one scheduled instant (deadline, Start Tournament, Round 1). */
export function TimeControl({
  slug,
  field,
  hasValue,
}: {
  slug: string;
  field: "deadline" | "publishAt" | "startAt";
  hasValue: boolean;
}) {
  const [value, setValue] = useState("");
  const { status, pending, run } = useStatus();

  const apply = (local: string | null) => {
    run(() => {
      const tz = new Date().getTimezoneOffset();
      if (field === "deadline") return setDeadlineAction(slug, local, tz);
      return updateSettingsAction(
        slug,
        field === "publishAt" ? { publishAtLocal: local } : { startAtLocal: local },
        tz
      );
    });
    setValue("");
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-md border border-line px-2 py-1 text-sm"
        aria-label="Schedule a time"
      />
      <button type="button" className={btnSm} disabled={pending || !value} onClick={() => apply(value)}>
        {hasValue ? "Change" : "Set time"}
      </button>
      {hasValue && (
        <button type="button" className={btnSm} disabled={pending} onClick={() => apply(null)}>
          Clear
        </button>
      )}
      <StatusNote status={status} />
    </span>
  );
}

/** One duration (round or break length) in minutes, editable until the tournament starts. */
export function DurationEditor({
  slug,
  field,
  minutes,
}: {
  slug: string;
  field: "round" | "break";
  minutes: number;
}) {
  const [value, setValue] = useState(String(minutes));
  const { status, pending, run } = useStatus();
  const dirty = Number(value) !== minutes;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
      <input
        type="number"
        min={field === "round" ? 1 : 0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 rounded-md border border-line px-2 py-1"
        aria-label={field === "round" ? "Round length in minutes" : "Break length in minutes"}
      />
      min
      <button
        type="button"
        className={btnSm}
        disabled={pending || !dirty}
        onClick={() =>
          run(() =>
            updateSettingsAction(
              slug,
              field === "round" ? { roundMinutes: Number(value) } : { breakMinutes: Number(value) },
              new Date().getTimezoneOffset()
            )
          )
        }
      >
        Save
      </button>
      <StatusNote status={status} />
    </span>
  );
}
