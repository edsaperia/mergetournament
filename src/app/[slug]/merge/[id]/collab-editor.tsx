"use client";

import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { yCollab } from "y-codemirror.next";
import { countWords } from "../../../../lib/text";

const COLORS = ["#30bced", "#6eeb83", "#ffbc42", "#ecd444", "#ee6352", "#9ac2c9", "#8acb88", "#1be7ff"];

/**
 * The shared merge-candidate editor: CodeMirror bound to a Yjs document over
 * Hocuspocus, with presence cursors. Read-only for non-bearers and frozen
 * merges — enforced server-side; the flag here is just UX.
 */
export function CollabEditor({
  wsUrl,
  docName,
  token,
  readOnly,
  userName,
}: {
  wsUrl: string;
  docName: string;
  token: string;
  readOnly: boolean;
  userName: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [words, setWords] = useState(0);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");

  useEffect(() => {
    if (!host.current) return;
    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: wsUrl,
      name: docName,
      token,
      document: ydoc,
      onStatus: ({ status: s }) => setStatus(s === "connected" ? "connected" : s === "connecting" ? "connecting" : "disconnected"),
    });
    const ytext = ydoc.getText("content");
    provider.setAwarenessField("user", {
      name: userName,
      color: COLORS[Math.abs(userName.split("").reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % COLORS.length],
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [
          basicSetup,
          markdown(),
          yCollab(ytext, provider.awareness),
          EditorView.editable.of(!readOnly),
          EditorView.lineWrapping,
          EditorView.theme({
            "&": { fontSize: "13px", minHeight: "20rem" },
            ".cm-content": { fontFamily: "var(--font-geist-mono), monospace" },
          }),
        ],
      }),
      parent: host.current,
    });

    const count = () => setWords(countWords(ytext.toString()));
    ytext.observe(count);
    count();

    return () => {
      ytext.unobserve(count);
      view.destroy();
      provider.destroy();
      ydoc.destroy();
    };
  }, [wsUrl, docName, token, readOnly, userName]);

  return (
    <div>
      <div
        ref={host}
        className={`overflow-hidden rounded-md border ${
          readOnly ? "border-amber-400" : "border-line"
        }`}
      />
      <p className="mt-1 flex justify-between text-xs text-muted">
        <span className="tabular-nums">{words} words</span>
        <span>
          {status === "connected" ? "live" : status}
          {readOnly && " · read-only"}
        </span>
      </p>
    </div>
  );
}
