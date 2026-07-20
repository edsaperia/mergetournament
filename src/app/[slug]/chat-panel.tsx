"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { postMessageAction, type ActionState } from "../../server/actions";
import type { MessageView } from "../../services/chat-service";

const initial: ActionState = { ok: true, message: "" };

/** A collapsible chat room: message log + composer (SPEC §5). */
export function ChatPanel({
  slug,
  roomId,
  title,
  messages,
  canPost,
  defaultOpen = true,
}: {
  slug: string;
  roomId: string;
  title: string;
  messages: MessageView[];
  canPost: boolean;
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
    <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold"
      >
        <span>{title}</span>
        <span className="text-xs text-neutral-500">
          {messages.length} · {open ? "hide" : "show"}
        </span>
      </button>
      {open && (
        <div className="border-t border-neutral-200 dark:border-neutral-800">
          <div ref={log} className="max-h-80 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 && <p className="text-xs text-neutral-400">No messages yet.</p>}
            {messages.map((m) =>
              m.kind === "system" ? (
                <p key={m.id} className="text-xs italic text-neutral-500">
                  ⚙ {m.body}
                </p>
              ) : (
                <p key={m.id} className="text-sm">
                  <span className="font-semibold">{m.author}</span>{" "}
                  <span className="text-xs text-neutral-400">
                    {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <br />
                  {m.body}
                </p>
              )
            )}
          </div>
          {canPost && (
            <form ref={formRef} action={dispatch} className="flex gap-2 border-t border-neutral-200 p-2 dark:border-neutral-800">
              <input
                name="body"
                required
                maxLength={4000}
                placeholder="Say something…"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
              <button disabled={pending} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
                Send
              </button>
            </form>
          )}
          {!state.ok && <p className="px-3 pb-2 text-xs text-red-600">{state.message}</p>}
        </div>
      )}
    </section>
  );
}
