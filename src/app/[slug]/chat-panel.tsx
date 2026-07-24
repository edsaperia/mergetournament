"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { postMessageAction, type ActionState } from "../../server/actions";
import type { MessageView } from "../../services/chat-service";

const initial: ActionState = { ok: true, message: "" };

/**
 * A message timestamp in the viewer's clock: time alone for today, date +
 * time for older messages (+ year once it differs). Chats are perpetual, so
 * "14:32" alone stops meaning much after the first day.
 */
function MessageTime({ at }: { at: string | Date }) {
  const date = new Date(at);
  const now = new Date();
  const time: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  const text =
    date.toDateString() === now.toDateString()
      ? date.toLocaleTimeString([], time)
      : date.toLocaleString([], {
          day: "numeric",
          month: "short",
          ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
          ...time,
        });
  return (
    <time dateTime={date.toISOString()} suppressHydrationWarning>
      {text}
    </time>
  );
}

/** A collapsible chat room: message log + composer (SPEC §5). */
export function ChatPanel({
  slug,
  roomId,
  title,
  messages,
  canPost,
  readOnlyNote,
  defaultOpen = true,
}: {
  slug: string;
  roomId: string;
  title: string;
  messages: MessageView[];
  canPost: boolean;
  /** Shown instead of the composer when the viewer cannot post. */
  readOnlyNote?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const log = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState(
    async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await postMessageAction(slug, roomId, String(formData.get("body") ?? ""));
      if (result.ok) formRef.current?.reset();
      return result;
    },
    initial
  );

  useEffect(() => {
    if (open && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages.length, open]);

  return (
    <section className="rounded-lg border border-edge">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold"
      >
        <span>{title}</span>
        <span className="text-xs text-muted">
          {messages.length} · {open ? "hide" : "show"}
        </span>
      </button>
      {open && (
        <div className="border-t border-edge">
          <div ref={log} className="max-h-80 space-y-2 overflow-y-auto overflow-x-hidden p-3">
            {messages.length === 0 && <p className="text-xs text-faint">No messages yet.</p>}
            {messages.map((m) =>
              m.kind === "system" ? (
                <p key={m.id} className="text-xs italic text-muted [overflow-wrap:anywhere]">
                  <span className="not-italic text-faint">
                    <MessageTime at={m.at} />
                  </span>{" "}
                  ⚙ {m.body}
                </p>
              ) : (
                <p key={m.id} className="text-sm [overflow-wrap:anywhere]">
                  <span className="font-semibold">{m.author}</span>{" "}
                  <span className="text-xs text-faint">
                    <MessageTime at={m.at} />
                  </span>
                  <br />
                  {m.body}
                </p>
              )
            )}
          </div>
          {canPost && (
            <form ref={formRef} action={dispatch} className="flex gap-2 border-t border-edge p-2">
              <input
                name="body"
                required
                maxLength={4000}
                placeholder="Say something…"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-md border border-line px-2 py-1.5 text-base sm:text-sm"
              />
              <button disabled={pending} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-50">
                Send
              </button>
            </form>
          )}
          {!canPost && readOnlyNote && (
            <p className="border-t border-edge px-3 py-2 text-xs text-muted">{readOnlyNote}</p>
          )}
          {!state.ok && <p className="px-3 pb-2 text-xs text-red-600">{state.message}</p>}
        </div>
      )}
    </section>
  );
}
