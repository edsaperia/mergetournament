/** Word count for the live counters (SPEC §4): markdown-aware enough to not count syntax. */
export function countWords(md: string): number {
  const stripped = md
    .replace(/```[\s\S]*?```/g, " ") // code fences
    .replace(/[#>*_`~\-|]+/g, " ") // markdown syntax characters
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // links: keep the label
  const words = stripped.split(/\s+/).filter((w) => /\w/.test(w));
  return words.length;
}

/**
 * The size of a text in words and lines, for confirming which text is meant
 * ("12 words · 3 lines"), or "empty" when there is nothing but whitespace:
 * a blank editor still holds one empty line, and "0 words · 1 line" misleads.
 */
export function textSize(md: string): string {
  if (md.trim() === "") return "empty";
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${plural(countWords(md), "word")} · ${plural(md.split("\n").length, "line")}`;
}
