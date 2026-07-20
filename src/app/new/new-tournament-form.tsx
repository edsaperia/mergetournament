"use client";

import { useActionState } from "react";
import { createTournamentAction, type ActionState } from "../../server/actions";
import { ActionStatus } from "../action-status";
import { field, fieldLabel as label } from "../ui";

const initial: ActionState = { ok: true, message: "" };

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
        <p className="mt-1 text-xs text-muted">Lowercase letters, digits, hyphens. The tournament lives at /&lt;slug&gt;.</p>
      </div>
      <fieldset className="rounded-md border border-edge p-4">
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
        <p className="mt-2 text-xs text-muted">Your admin magic link will be emailed here.</p>
      </fieldset>
      <button
        disabled={pending}
        className="rounded-lg bg-accent px-5 py-3 font-medium text-accent-ink hover:bg-accent-soft disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create tournament"}
      </button>
      <p className="text-xs text-muted">
        Round timings, the submission deadline, visibility, the draft template,
        and colors are all set afterwards from your admin page — nothing here is
        final except the URL.
      </p>
      <ActionStatus state={state} />
    </form>
  );
}
