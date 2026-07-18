"use client";

import { useActionState, useState } from "react";
import { saveDraftAction, type ActionState } from "../../../server/actions";
import { countWords } from "../../../lib/text";
import { ActionStatus } from "../../action-status";

const initial: ActionState = { ok: true, message: "" };

export function DraftEditor({ slug, initialBody }: { slug: string; initialBody: string }) {
  const action = saveDraftAction.bind(null, slug);
  const [state, formAction, pending] = useActionState(action, initial);
  const [body, setBody] = useState(initialBody);

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-3">
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        spellCheck
        className="min-h-[24rem] flex-1 rounded-md border border-neutral-300 p-4 font-mono text-sm leading-relaxed dark:border-neutral-700 dark:bg-neutral-900"
      />
      <div className="flex items-center justify-between">
        <span className="text-sm tabular-nums text-neutral-500">{countWords(body)} words</span>
        <button
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-5 py-2 font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {pending ? "Saving…" : "Save draft"}
        </button>
      </div>
      <ActionStatus state={state} />
    </form>
  );
}
