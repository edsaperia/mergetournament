"use client";

import { useState, useTransition } from "react";
import { updateSettingsAction, type ActionState } from "../../../server/actions";
import { btnPrimary, fieldLabel } from "../../ui";

/**
 * The default submission every participant's draft starts from. The box
 * matches the size of the participants' own draft editor (min-h-96, mono)
 * so what the admin writes is what they will see.
 */
export function TemplateEditor({
  slug,
  prePublish,
  defaultSubmission,
}: {
  slug: string;
  prePublish: boolean;
  defaultSubmission: string;
}) {
  const [template, setTemplate] = useState(defaultSubmission);
  const [status, setStatus] = useState<ActionState>({ ok: true, message: "" });
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () =>
      setStatus(await updateSettingsAction(slug, { defaultSubmission: template }, new Date().getTimezoneOffset()))
    );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className={fieldLabel} htmlFor="t-template">Default submission</label>
        <p className="mb-2 text-sm text-muted">
          Every participant&apos;s draft starts as a copy of this — a shared skeleton, agreed
          headings, or a full starting text. Participants who have already begun writing keep
          what they have.
        </p>
        <textarea
          className="min-h-96 w-full rounded-md border border-line bg-background px-3 py-2 font-mono text-[13px]"
          id="t-template"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          disabled={!prePublish}
          placeholder={"# Preamble\n\n..."}
        />
        {!prePublish && <p className="mt-1 text-xs text-muted">The template froze when the tournament started.</p>}
      </div>
      {prePublish && (
        <div className="flex items-center gap-3">
          <button type="button" className={btnPrimary} disabled={pending} onClick={save}>
            Save template
          </button>
          {status.message && (
            <span className={status.ok ? "text-sm text-muted" : "text-sm text-red-600"}>{status.message}</span>
          )}
        </div>
      )}
    </div>
  );
}
