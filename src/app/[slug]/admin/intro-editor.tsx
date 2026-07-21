"use client";

import { useState, useTransition } from "react";
import { updateSettingsAction, type ActionState } from "../../../server/actions";
import { btnPrimary, btnSecondary, fieldLabel } from "../../ui";

/**
 * The participant brief ("About this tournament") — the one piece of
 * context only the admin can write: what we're drafting, why, and what
 * happens to the result. Shown at the top of the tournament page and in
 * every invite email. The generic how-a-merge-tournament-works explainer
 * is built in and lives elsewhere; this is about THIS tournament.
 */
export function IntroEditor({
  slug,
  intro,
  adminName,
  tournamentName,
}: {
  slug: string;
  intro: string;
  adminName: string;
  tournamentName: string;
}) {
  const [value, setValue] = useState(intro);
  const [status, setStatus] = useState<ActionState>({ ok: true, message: "" });
  const [pending, startTransition] = useTransition();

  const example = [
    `${adminName} has invited you to help write ${tournamentName}.`,
    ``,
    `What we're doing: [one or two sentences on what this document is and why it matters — e.g. "drafting a constitution for our association, to be adopted at the founding meeting"].`,
    ``,
    `What to write: [what a draft should cover, roughly how long it should be, anything it must include].`,
    ``,
    `What happens to the result: [e.g. "the winning text goes to a ratification vote" — say whether it's binding or advisory].`,
    ``,
    `Write your own complete draft before the deadline — in the tournament you'll defend it, merge it with others, and shape what survives. Come with opinions.`,
  ].join("\n");

  const save = () =>
    startTransition(async () =>
      setStatus(await updateSettingsAction(slug, { intro: value }, new Date().getTimezoneOffset()))
    );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className={fieldLabel} htmlFor="i-intro">About this tournament</label>
        <p className="mb-2 text-sm text-muted">
          Participants see this at the top of the tournament page and in their invite email —
          it&apos;s the part only you can write: what you&apos;re drafting together, why, and what
          happens to the winning text. (How a merge tournament works is explained to them
          automatically; you don&apos;t need to cover that.)
        </p>
        <textarea
          className="min-h-64 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          id="i-intro"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={example}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btnPrimary} disabled={pending || value === intro} onClick={save}>
          Save intro
        </button>
        {value.trim() === "" && (
          <button type="button" className={btnSecondary} onClick={() => setValue(example)}>
            Start from the example
          </button>
        )}
        {status.message && (
          <span className={status.ok ? "text-sm text-muted" : "text-sm text-red-600"}>{status.message}</span>
        )}
      </div>
    </div>
  );
}
