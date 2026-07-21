"use client";

import { useActionState, useState } from "react";
import {
  addParticipantAction,
  reissueLinkAction,
  removeParticipantAction,
  sendTestInviteAction,
  updateParticipantAction,
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

/** Click to edit; Enter or blur saves, Escape cancels. */
function EditableCell({
  value,
  mono = false,
  label,
  onSave,
}: {
  value: string;
  mono?: boolean;
  label: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        title={`Click to edit ${label}`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={`cursor-text rounded px-1 -mx-1 text-left hover:bg-panel ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onSave(next);
  };
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      aria-label={label}
      className={`w-full rounded border border-line px-1 py-0.5 ${mono ? "font-mono text-xs" : "text-sm"}`}
    />
  );
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

export function Roster({
  slug,
  rows,
  introDone = true,
}: {
  slug: string;
  rows: RosterRow[];
  /** Inviting is gated (UI-only) until the tournament has an intro. */
  introDone?: boolean;
}) {
  const [viewing, setViewing] = useState<RosterRow | null>(null);
  const [editStatus, setEditStatus] = useState<ActionState>(initial);
  const [state, addAction, adding] = useActionState(addParticipantAction.bind(null, slug), initial);
  const [testState, testAction, testing] = useActionState(async () => sendTestInviteAction(slug), initial);

  const patchParticipant = (id: string, patch: { name?: string; email?: string }) => {
    setEditStatus({ ok: true, message: "Saving…" });
    void updateParticipantAction(slug, id, patch).then(setEditStatus);
  };
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
                <EditableCell value={r.name} label="name" onSave={(name) => patchParticipant(r.id, { name })} />
                {r.role === "admin" && <span className="ml-1 text-xs text-muted">(admin)</span>}
              </td>
              <td className="py-2 pr-4">
                <EditableCell
                  value={r.email}
                  mono
                  label="email"
                  onSave={(email) => patchParticipant(r.id, { email })}
                />
                {r.emailStatus && (
                  <span className={`ml-2 text-xs ${EMAIL_STATUS_STYLE[r.emailStatus] ?? "text-muted"}`}>
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
      <ActionStatus state={editStatus} />

      <form action={addAction} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="p-name">Name</label>
          <input className={field} id="p-name" name="name" required disabled={!introDone} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="p-email">Email</label>
          <input className={field} id="p-email" name="email" type="email" required disabled={!introDone} />
        </div>
        <button
          disabled={adding || !introDone}
          title={introDone ? undefined : "write the intro first"}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-ink hover:bg-accent-soft disabled:opacity-50"
        >
          {adding ? "Inviting…" : "Invite participant"}
        </button>
      </form>
      {!introDone && (
        <p className="-mt-4 text-sm text-muted">
          Invites include your intro, so participants arrive knowing what this is —{" "}
          <a className="underline" href="#intro">write the intro first →</a>
        </p>
      )}
      <ActionStatus state={state} />

      <form action={testAction} className="flex flex-wrap items-center gap-3 border-t border-edge-faint pt-4">
        <button
          disabled={testing}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:border-strong disabled:opacity-50"
        >
          {testing ? "Sending…" : "Email me a test invite"}
        </button>
        <span className="text-xs text-muted">
          see exactly what participants will receive, before you send the real ones
        </span>
        <ActionStatus state={testState} />
      </form>

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
