"use client";

import { useState, useTransition } from "react";
import { updateSettingsAction, type ActionState } from "../../../server/actions";
import { LocalTime } from "../../local-time";
import { btnPrimary, btnSecondary, field, fieldLabel } from "../../ui";

/**
 * Schedule and visibility settings, ordered by lifecycle: when Round 1
 * starts, how long rounds and breaks run, who can watch. Durations freeze
 * when the tournament starts (SPEC §4 Phase 0); the Round 1 start datetime
 * is editable until Round 1 actually opens.
 */
export function SettingsEditor({
  slug,
  prePublish,
  begun,
  roundMinutes,
  breakMinutes,
  startAtIso,
  visibility,
}: {
  slug: string;
  prePublish: boolean;
  begun: boolean;
  roundMinutes: number;
  breakMinutes: number;
  startAtIso: string | null;
  visibility: "public" | "participants_only";
}) {
  const [round, setRound] = useState(String(roundMinutes));
  const [brk, setBrk] = useState(String(breakMinutes));
  const [startLocal, setStartLocal] = useState("");
  const [clearStart, setClearStart] = useState(false);
  const [vis, setVis] = useState(visibility);
  const [status, setStatus] = useState<ActionState>({ ok: true, message: "" });
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setStatus(
        await updateSettingsAction(
          slug,
          {
            visibility: vis,
            ...(prePublish ? { roundMinutes: Number(round), breakMinutes: Number(brk) } : {}),
            ...(!begun
              ? { startAtLocal: clearStart ? null : startLocal ? startLocal : undefined }
              : {}),
          },
          new Date().getTimezoneOffset()
        )
      );
      setStartLocal("");
      setClearStart(false);
    });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className={fieldLabel} htmlFor="s-start">Round 1 start</label>
        <p className="mb-1 text-sm text-muted">
          {startAtIso ? (
            <>
              Currently: <LocalTime iso={startAtIso} /> — Round 1 opens automatically then, once the
              tournament has started.
            </>
          ) : (
            "Not set — you start Round 1 manually once everyone has convened."
          )}
        </p>
        {!begun ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="rounded-md border border-line px-2 py-1.5"
              id="s-start"
              type="datetime-local"
              value={startLocal}
              onChange={(e) => {
                setStartLocal(e.target.value);
                setClearStart(false);
              }}
            />
            {startAtIso && (
              <button
                type="button"
                className={btnSecondary}
                onClick={() => {
                  setClearStart(true);
                  setStartLocal("");
                }}
              >
                {clearStart ? "Will clear on save" : "Clear"}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted">Round 1 has already started.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div>
          <label className={fieldLabel} htmlFor="s-round">Round length (minutes)</label>
          <input className={field} id="s-round" type="number" min="1" value={round} onChange={(e) => setRound(e.target.value)} disabled={!prePublish} />
        </div>
        <div>
          <label className={fieldLabel} htmlFor="s-break">Break length (minutes)</label>
          <input className={field} id="s-break" type="number" min="0" value={brk} onChange={(e) => setBrk(e.target.value)} disabled={!prePublish} />
        </div>
      </div>
      {!prePublish && <p className="-mt-2 text-xs text-muted">Durations froze when the tournament started.</p>}

      <div className="sm:max-w-md">
        <label className={fieldLabel} htmlFor="s-visibility">Visibility</label>
        <select
          className={field}
          id="s-visibility"
          value={vis}
          onChange={(e) => setVis(e.target.value as "public" | "participants_only")}
        >
          <option value="public">Public — anyone with the URL can observe</option>
          <option value="participants_only">Participants only</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className={btnPrimary} disabled={pending} onClick={save}>
          Save settings
        </button>
        {status.message && (
          <span className={status.ok ? "text-sm text-muted" : "text-sm text-red-600"}>{status.message}</span>
        )}
      </div>
    </div>
  );
}
