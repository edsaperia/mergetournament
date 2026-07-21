"use client";

import { useState, useTransition } from "react";
import { updateSettingsAction, type ActionState } from "../../../server/actions";
import { btnPrimary, field, fieldLabel } from "../../ui";

/** Who can watch — editable at any phase. Lives in the Settings section under the timeline. */
export function VisibilityEditor({
  slug,
  visibility,
}: {
  slug: string;
  visibility: "public" | "participants_only";
}) {
  const [vis, setVis] = useState(visibility);
  const [status, setStatus] = useState<ActionState>({ ok: true, message: "" });
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2 sm:max-w-md">
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
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={btnPrimary}
          disabled={pending || vis === visibility}
          onClick={() =>
            startTransition(async () =>
              setStatus(await updateSettingsAction(slug, { visibility: vis }, new Date().getTimezoneOffset()))
            )
          }
        >
          Save
        </button>
        {status.message && (
          <span className={status.ok ? "text-sm text-muted" : "text-sm text-red-600"}>{status.message}</span>
        )}
      </div>
    </div>
  );
}
