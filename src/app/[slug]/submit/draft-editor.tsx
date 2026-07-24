"use client";

import { useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { saveDraftAction } from "../../../server/actions";
import { countWords } from "../../../lib/text";

/**
 * The always-open draft editor: CodeMirror (line numbers, proper soft-wrap)
 * with no save or submit button. Edits autosave debounced; whatever is here
 * when submissions close is the draft (SPEC §4 Phase 1).
 */
export function DraftEditor({ slug, initialBody }: { slug: string; initialBody: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [words, setWords] = useState(() => countWords(initialBody));
  const [status, setStatus] = useState<{ ok: boolean; text: string }>({ ok: true, text: "" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSaved = useRef(initialBody);

  useEffect(() => {
    if (!host.current) return;
    const save = async (text: string) => {
      if (text === lastSaved.current) return;
      setStatus({ ok: true, text: "Saving…" });
      const result = await saveDraftAction(slug, text);
      if (result.ok) lastSaved.current = text;
      setStatus({ ok: result.ok, text: result.message });
    };

    const view = new EditorView({
      state: EditorState.create({
        doc: initialBody,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          EditorView.theme({
            "&": { fontSize: "var(--editor-font-size)", minHeight: "24rem" },
            ".cm-content": { fontFamily: "var(--font-geist-mono), monospace" },
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const text = update.state.doc.toString();
            setWords(countWords(text));
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => void save(text), 800);
          }),
        ],
      }),
      parent: host.current,
    });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      // Flush any unsaved edits on unmount.
      void save(view.state.doc.toString());
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div ref={host} className="overflow-hidden rounded-md border border-line" />
      <div className="flex items-center justify-between text-sm">
        <span className="tabular-nums text-muted">{words} words</span>
        <span className="text-muted">{status.ok ? status.text || "Autosaves as you type" : ""}</span>
      </div>
      {!status.ok && (
        <p className="rounded-md border border-danger bg-danger-surface px-3 py-2 text-sm font-medium text-danger">
          ⚠ Not saved: {status.text}
        </p>
      )}
    </div>
  );
}
