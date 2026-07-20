"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveDraftAction } from "../../../server/actions";
import { countWords } from "../../../lib/text";

/**
 * The always-open draft editor: no save or submit button. Edits autosave
 * (debounced, plus on blur); whatever is here when submissions close is the
 * draft (SPEC §4 Phase 1: revise freely until the deadline).
 */
export function DraftEditor({ slug, initialBody }: { slug: string; initialBody: string }) {
  const [body, setBody] = useState(initialBody);
  const [status, setStatus] = useState<{ ok: boolean; text: string }>({ ok: true, text: "" });
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSaved = useRef(initialBody);

  const save = (text: string) => {
    if (text === lastSaved.current) return;
    setStatus({ ok: true, text: "Saving…" });
    startTransition(async () => {
      const result = await saveDraftAction(slug, text);
      if (result.ok) lastSaved.current = text;
      setStatus({ ok: result.ok, text: result.message });
    });
  };

  const onChange = (text: string) => {
    setBody(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(text), 800);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-2">
      <textarea
        value={body}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          save(body);
        }}
        spellCheck
        className="min-h-[24rem] flex-1 rounded-md border border-line p-4 font-mono text-sm leading-relaxed"
      />
      <div className="flex items-center justify-between text-sm">
        <span className="tabular-nums text-muted">{countWords(body)} words</span>
        <span className={status.ok ? "text-muted" : "text-red-600"}>
          {status.text || "Autosaves as you type"}
        </span>
      </div>
    </div>
  );
}
