/** Word count for the live counters (SPEC §4): markdown-aware enough to not count syntax. */
export function countWords(md: string): number {
  const stripped = md
    .replace(/```[\s\S]*?```/g, " ") // code fences
    .replace(/[#>*_`~\-|]+/g, " ") // markdown syntax characters
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // links: keep the label
  const words = stripped.split(/\s+/).filter((w) => /\w/.test(w));
  return words.length;
}
