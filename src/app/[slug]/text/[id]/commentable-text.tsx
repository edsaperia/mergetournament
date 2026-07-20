"use client";

import { useActionState, useState } from "react";
import { addCommentAction, type ActionState } from "../../../../server/actions";
import type { CommentView } from "../../../../services/chat-service";

const initial: ActionState = { ok: true, message: "" };

/**
 * A read-only text with line numbers and line-anchored comments (SPEC §5).
 * Click a line number to comment on that line.
 */
export function CommentableText({
  slug,
  textId,
  body,
  comments,
  canComment,
}: {
  slug: string;
  textId: string;
  body: string;
  comments: CommentView[];
  canComment: boolean;
}) {
  const [target, setTarget] = useState<number | null>(null);
  /** Lines whose comment threads the reader has collapsed. */
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [state, dispatch, pending] = useActionState(
    async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await addCommentAction(
        slug,
        textId,
        Number(formData.get("line")),
        String(formData.get("body") ?? "")
      );
      if (result.ok) setTarget(null);
      return result;
    },
    initial
  );

  const lines = body.split("\n");
  const byLine = new Map<number, CommentView[]>();
  for (const c of comments) {
    byLine.set(c.line, [...(byLine.get(c.line) ?? []), c]);
  }

  return (
    <div className="rounded-lg border border-edge font-mono text-sm leading-relaxed">
      {lines.map((line, i) => (
        <div key={i}>
          <div className="group flex hover:bg-wash">
            <span
              className={`w-12 shrink-0 select-none border-r border-edge-faint px-2 text-right text-xs leading-6 text-faint ${
                byLine.has(i) ? "font-bold text-live-ink" : ""
              }`}
            >
              {i + 1}
            </span>
            <pre className="min-w-0 flex-1 whitespace-pre-wrap px-3">{line || " "}</pre>
            {(canComment || byLine.has(i)) && (
              <button
                type="button"
                onClick={() => {
                  // Toggle the whole line: thread + composer together.
                  const open = !collapsed.has(i) && (byLine.has(i) || target === i);
                  if (open) {
                    setCollapsed((s) => new Set(s).add(i));
                    if (target === i) setTarget(null);
                  } else {
                    setCollapsed((s) => {
                      const next = new Set(s);
                      next.delete(i);
                      return next;
                    });
                    if (canComment) setTarget(i);
                  }
                }}
                title={byLine.has(i) ? "Show or hide this line's comments" : "Comment on this line"}
                aria-label={`Comments on line ${i + 1}`}
                className={`w-8 shrink-0 select-none text-center text-xs leading-6 text-muted hover:text-foreground ${
                  target === i || byLine.has(i) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                💬{byLine.has(i) ? byLine.get(i)!.length : ""}
              </button>
            )}
          </div>
          {!collapsed.has(i) &&
            (byLine.get(i) ?? []).map((c) => (
            <div key={c.id} className="ml-12 border-l-2 border-blue-200 bg-blue-50/50 px-3 py-1 font-sans text-xs dark:border-blue-900 dark:bg-blue-950/30">
              <span className="font-semibold">{c.author}</span>{" "}
              <span className="text-faint">
                {new Date(c.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
              <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          {target === i && canComment && (
            <form action={dispatch} className="ml-12 flex gap-2 border-l-2 border-blue-400 bg-blue-50 px-3 py-2 font-sans dark:bg-blue-950/50">
              <input type="hidden" name="line" value={i} />
              <input
                name="body"
                required
                maxLength={4000}
                autoFocus
                placeholder={`Comment on line ${i + 1}…`}
                className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 text-xs"
              />
              <button disabled={pending} className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-ink disabled:opacity-50">
                Comment
              </button>
            </form>
          )}
        </div>
      ))}
      {!state.ok && <p className="px-3 py-1 font-sans text-xs text-red-600">{state.message}</p>}
    </div>
  );
}
