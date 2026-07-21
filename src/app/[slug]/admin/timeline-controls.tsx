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

/** Round and break lengths, editable until the tournament starts. */
export function DurationsEditor({
  slug,
  roundMinutes,
  breakMinutes,
}: {
  slug: string;
  roundMinutes: number;
  breakMinutes: number;
}) {
  const [round, setRound] = useState(String(roundMinutes));
  const [brk, setBrk] = useState(String(breakMinutes));
  const { status, pending, run } = useStatus();
  const dirty = Number(round) !== roundMinutes || Number(brk) !== breakMinutes;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
      rounds
      <input
        type="number"
        min="1"
        value={round}
        onChange={(e) => setRound(e.target.value)}
        className="w-16 rounded-md border border-line px-2 py-1"
        aria-label="Round length in minutes"
      />
      min · breaks
      <input
        type="number"
        min="0"
        value={brk}
        onChange={(e) => setBrk(e.target.value)}
        className="w-16 rounded-md border border-line px-2 py-1"
        aria-label="Break length in minutes"
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
              { roundMinutes: Number(round), breakMinutes: Number(brk) },
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
