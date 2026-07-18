"use client";

import { useActionState } from "react";
import { createTournamentAction, type ActionState } from "../../server/actions";
import { ActionStatus } from "../action-status";

const initial: ActionState = { ok: true, message: "" };

const field = "w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900";
const label = "block text-sm font-medium mb-1";

export function NewTournamentForm() {
  const [state, formAction, pending] = useActionState(createTournamentAction, initial);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label className={label} htmlFor="name">Tournament name</label>
        <input className={field} id="name" name="name" required placeholder="Our Constitutional Convention" />
      </div>
      <div>
        <label className={label} htmlFor="slug">URL slug</label>
        <input
          className={field} id="slug" name="slug" required
          pattern="[a-z0-9][a-z0-9-]{1,62}" placeholder="our-convention"
        />
        <p className="mt-1 text-xs text-neutral-500">Lowercase letters, digits, hyphens. The tournament lives at /&lt;slug&gt;.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="roundMinutes">Round length (minutes)</label>
          <input className={field} id="roundMinutes" name="roundMinutes" type="number" min="1" defaultValue="30" required />
        </div>
        <div>
          <label className={label} htmlFor="breakMinutes">Break length (minutes)</label>
          <input className={field} id="breakMinutes" name="breakMinutes" type="number" min="0" defaultValue="10" required />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="visibility">Visibility</label>
        <select className={field} id="visibility" name="visibility" defaultValue="public">
          <option value="public">Public — anyone with the URL can observe</option>
          <option value="participants_only">Participants only</option>
        </select>
      </div>
      <div>
        <label className={label} htmlFor="defaultSubmission">Default submission (template all drafts start from)</label>
        <textarea className={`${field} font-mono text-sm`} id="defaultSubmission" name="defaultSubmission" rows={4} placeholder="# Preamble&#10;&#10;..." />
      </div>
      <fieldset className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">You, the administrator</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="adminName">Name</label>
            <input className={field} id="adminName" name="adminName" required />
          </div>
          <div>
            <label className={label} htmlFor="adminEmail">Email</label>
            <input className={field} id="adminEmail" name="adminEmail" type="email" required />
          </div>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Your admin magic link will be emailed here.</p>
      </fieldset>
      <button
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-5 py-3 font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {pending ? "Creating…" : "Create tournament"}
      </button>
      <ActionStatus state={state} />
    </form>
  );
}
