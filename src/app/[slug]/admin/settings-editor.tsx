"use client";

import { useState, useTransition } from "react";
import { updateSettingsAction, type ActionState } from "../../../server/actions";
import { LocalTime } from "../../local-time";
import { btnPrimary, btnSecondary, field, fieldLabel } from "../../ui";

/**
 * Tournament settings (SPEC §4 Phase 0): durations and the submission
 * template until publication; the start datetime until the tournament
 * begins (it auto-begins at that time once convening).
 */
export function SettingsEditor({
  slug,
  prePublish,
  begun,
  roundMinutes,
  breakMinutes,
  startAtIso,
  defaultSubmission,
  visibility,
}: {
  slug: string;
  prePublish: boolean;
  begun: boolean;
  roundMinutes: number;
  breakMinutes: number;
  startAtIso: string | null;
  defaultSubmission: string;
  visibility: "public" | "participants_only";
}) {
  const [round, setRound] = useState(String(roundMinutes));
  const [brk, setBrk] = useState(String(breakMinutes));
  const [startLocal, setStartLocal] = useState("");
  const [clearStart, setClearStart] = useState(false);
  const [template, setTemplate] = useState(defaultSubmission);
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
            ...(prePublish
              ? { roundMinutes: Number(round), breakMinutes: Number(brk), defaultSubmission: template }
              : {}),
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
      {!prePublish && <p className="-mt-2 text-xs text-muted">Durations froze when the bracket was published.</p>}

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

      <div>
        <label className={fieldLabel} htmlFor="s-start">Tournament start</label>
        <p className="mb-1 text-sm text-muted">
          {startAtIso ? (
            <>
              Currently: <LocalTime iso={startAtIso} /> — begins automatically then, once the bracket is published.
            </>
          ) : (
            "Not set — you begin manually from Convening."
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
          <p className="text-xs text-muted">The tournament has begun.</p>
        )}
      </div>

      <div>
        <label className={fieldLabel} htmlFor="s-template">Default submission (template)</label>
        <textarea
          className={`${field} font-mono text-sm`}
          id="s-template"
          rows={4}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          disabled={!prePublish}
        />
        <p className="mt-1 text-xs text-muted">
          Only affects participants who have not started their draft yet.
        </p>
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
