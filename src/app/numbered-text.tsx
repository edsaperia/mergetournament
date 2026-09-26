/**
 * Read-only text with line numbers, so chat can say "line 12" and everyone
 * finds it. Each logical line is its own row, so soft-wrapping keeps
 * numbers aligned. `firstLine` numbers an excerpt by its place in the whole.
 */
export function NumberedText({ body, firstLine = 1 }: { body: string; firstLine?: number }) {
  const lines = body.split("\n");
  return (
    <div className="font-mono text-sm leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="w-10 shrink-0 select-none border-r border-edge-faint pr-2 text-right text-xs leading-6 text-faint">
            {i + firstLine}
          </span>
          <pre className="min-w-0 flex-1 whitespace-pre-wrap pl-3">{line || " "}</pre>
        </div>
      ))}
    </div>
  );
}
