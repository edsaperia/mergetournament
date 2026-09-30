import { markdown } from "@codemirror/lang-markdown";

/**
 * Markdown highlighting for the draft and merge editors, without the
 * Markdown keymap: its Enter continues lists, so after "1. …" typing "2. "
 * gave "2. 2. ", and every charter-style draft is numbered. Enter now just
 * starts a new line; people type their own markers.
 */
export function markdownEditing() {
  return markdown({ addKeymap: false });
}
