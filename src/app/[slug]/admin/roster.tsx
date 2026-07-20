"use client";

import { useActionState, useState } from "react";
import {
  addParticipantAction,
  reissueLinkAction,
  removeParticipantAction,
  type ActionState,
} from "../../../server/actions";
import Link from "next/link";
import { ActionStatus } from "../../action-status";
import { NumberedText } from "../../numbered-text";
import { field } from "../../ui";

const initial: ActionState = { ok: true, message: "" };

export interface RosterRow {
  id: string;
  name: string;
  email: string;
  role: string;
  wordCount: number | null;
  draftId: string | null;
  draftBody: string | null;
  /** Latest delivery event from the email provider, e.g. "delivered", "bounced". */
  emailStatus: string | null;
}

const EMAIL_STATUS_STYLE: Record<string, string> = {
  delivered: "text-green-600",
  opened: "text-green-600",
  clicked: "text-green-600",
  sent: "text-muted",
  bounced: "text-red-600 font-semibold",
  complained: "text-red-600 font-semibold",
  delivery_delayed: "text-amber-600",
};

export function Roster({ slug, rows }: { slug: string; rows: RosterRow[] }) {
  const [viewing, setViewing] = useState<RosterRow | null>(null);
  const [state, addAction, adding] = useActionState(addParticipantAction.bind(null, slug), initial);
  const [rowState, rowDispatch, rowPending] = useActionState(
    async (_prev: ActionState, form: FormData): Promise<ActionState> => {
      const id = String(form.get("id"));
      return form.get("intent") === "remove"
        ? removeParticipantAction(slug, id)
        : reissueLinkAction(slug, id);
    },
    initial
  );

  return (
    <div className="flex flex-col gap-6">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-edge text-muted">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Email</th>
            <th className="py-2 pr-4 font-medium">Submission</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-edge-faint">
              <td className="py-2 pr-4">
                {r.name}
                {r.role === "admin" && <span className="ml-1 text-xs text-muted">(admin)</span>}
              </td>
              <td className="py-2 pr-4 font-mono text-xs">
                {r.email}
                {r.emailStatus && (
                  <span className={`ml-2 font-sans ${EMAIL_STATUS_STYLE[r.emailStatus] ?? "text-muted"}`}>
                    {r.emailStatus.replace("_", " ")}
                  </span>
                )}
              </td>
              <td className="py-2 pr-4">
                {r.wordCount === null ? (
                  <span className="text-faint">—</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setViewing(r)}
                    className="underline hover:no-underline"
                    title={`Read ${r.name}'s draft`}
                  >
                    {r.wordCount} words
                  </button>
                )}
              </td>
              <td className="py-2">
                <form action={rowDispatch} className="flex justify-end gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    name="intent"
                    value="reissue"
                    disabled={rowPending}
                    className="text-xs underline hover:no-underline disabled:opacity-50"
                  >
                    re-issue link
                  </button>
                  {r.role !== "admin" && (
                    <button
                      name="intent"
                      value="remove"
                      disabled={rowPending}
                      className="text-xs text-red-600 underline hover:no-underline disabled:opacity-50"
                    >
                      remove
                    </button>
                  )}
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ActionStatus state={rowState} />

      <form action={addAction} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="p-name">Name</label>
          <input className={field} id="p-name" name="name" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="p-email">Email</label>
          <input className={field} id="p-email" name="email" type="email" required />
        </div>
        <button
          disabled={adding}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-ink hover:bg-accent-soft disabled:opacity-50"
        >
          {adding ? "Inviting…" : "Invite participant"}
        </button>
      </form>
      <ActionStatus state={state} />

      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setViewing(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-edge bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between border-b border-edge px-4 py-3">
              <p className="font-semibold">
                {viewing.name}&apos;s draft
                <span className="ml-2 text-sm font-normal text-muted">{viewing.wordCount} words</span>
              </p>
              <div className="flex gap-3 text-sm">
                {viewing.draftId && (
                  <Link className="underline" href={`/${slug}/text/${viewing.draftId}`}>
                    open full page
                  </Link>
                )}
                <button type="button" className="text-muted hover:text-foreground" onClick={() => setViewing(null)}>
                  ✕ close
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-2">
              <NumberedText body={viewing.draftBody ?? ""} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
