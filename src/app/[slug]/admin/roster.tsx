"use client";

import { useActionState, useState, useTransition } from "react";
import {
  bulkInviteAction,
  reissueLinkAction,
  removeParticipantAction,
  updateParticipantAction,
  type ActionState,
} from "../../../server/actions";
import Link from "next/link";
import { ActionStatus } from "../../action-status";
import { Modal } from "../../modal";
import { NumberedText } from "../../numbered-text";
import { TestInviteButton } from "./test-invite-button";

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
  delivered: "text-ok",
  opened: "text-ok",
  clicked: "text-ok",
  sent: "text-muted",
  bounced: "text-danger font-semibold",
  complained: "text-danger font-semibold",
  delivery_delayed: "text-warn",
};

interface InviteLine {
  line: number;
  text: string;
  name?: string;
  email?: string;
  error?: string;
}

/** One "name, email" per line; the last comma splits, so names may contain commas. */
function parseInviteLines(raw: string): InviteLine[] {
  return raw
    .split("\n")
    .map((text, i) => ({ line: i + 1, text }))
    .filter((l) => l.text.trim() !== "")
    .map((l) => {
      const idx = l.text.lastIndexOf(",");
      if (idx < 0) return { ...l, error: "expected: name, email" };
      const name = l.text.slice(0, idx).trim();
      const email = l.text.slice(idx + 1).trim();
      if (!name) return { ...l, error: "missing a name before the comma" };
      if (!/^\S+@\S+\.\S+$/.test(email)) return { ...l, error: `"${email}" does not look like an email address` };
      return { ...l, name, email };
    });
}

/** The bulk invite box: validate every line first, then invite; failed lines stay in the box. */
function BulkInvite({ slug, disabled }: { slug: string; disabled: boolean }) {
  const [raw, setRaw] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; lines: string[] }>({ ok: true, lines: [] });
  const [pending, startTransition] = useTransition();

  const invite = () => {
    const lines = parseInviteLines(raw);
    if (lines.length === 0) {
      setFeedback({ ok: false, lines: ["Nothing to invite — one participant per line, as: name, email"] });
      return;
    }
    const bad = lines.filter((l) => l.error);
    if (bad.length > 0) {
      setFeedback({ ok: false, lines: bad.map((l) => `Line ${l.line}: ${l.error}`) });
      return;
    }
    startTransition(async () => {
      const result = await bulkInviteAction(slug, lines.map((l) => ({ name: l.name!, email: l.email! })));
      if (result.ok) {
        setRaw("");
        setFeedback({ ok: true, lines: [result.message] });
      } else {
        // Successes are already invited; keep only the failed lines for another go.
        setRaw(lines.filter((_, i) => result.errors[i]).map((l) => l.text).join("\n"));
        setFeedback({
          ok: false,
          lines: [
            result.message,
            ...lines.flatMap((l, i) => (result.errors[i] ? [`${l.name} <${l.email}>: ${result.errors[i]}`] : [])),
          ],
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor="bulk-invite">Invite participants</label>
      <textarea
        id="bulk-invite"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        disabled={disabled}
        rows={4}
        placeholder={"Ada Lovelace, ada@example.org\nBo Brown, bo@example.org"}
        className="w-full max-w-xl rounded-md border border-line bg-background px-3 py-2 font-mono text-sm disabled:opacity-50"
      />
      <p className="text-xs text-muted">One per line: name, email. Each gets their personal magic link by email.</p>
      <div>
        <button
          type="button"
          onClick={invite}
          disabled={pending || disabled || raw.trim() === ""}
          title={disabled ? "write the intro first" : undefined}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-ink hover:bg-accent-soft disabled:opacity-50"
        >
          {pending ? "Inviting…" : "Invite"}
        </button>
      </div>
      {feedback.lines.length > 0 && (
        <ul className={`text-sm ${feedback.ok ? "text-muted" : "text-danger"}`}>
          {feedback.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
      <div className="overflow-x-auto">
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
                      className="text-xs text-danger underline hover:no-underline disabled:opacity-50"
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
      </div>
      <ActionStatus state={rowState} />
      <ActionStatus state={editStatus} />

      <BulkInvite slug={slug} disabled={!introDone} />
      {!introDone && (
        <p className="-mt-4 text-sm text-muted">
          Invites include your intro, so participants arrive knowing what this is —{" "}
          <a className="underline" href="#intro">write the intro first →</a>
        </p>
      )}

      <TestInviteButton slug={slug} />

      {viewing && (
        <Modal label={`${viewing.name}'s draft`} onDismiss={() => setViewing(null)} className="flex max-w-3xl flex-col">
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
        </Modal>
      )}
    </div>
  );
}
