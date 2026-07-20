"use client";

/**
 * Renders an instant in the viewer's local timezone. The server renders its
 * own timezone during SSR; the client corrects at hydration (suppressed
 * warning — the mismatch is expected and resolves to the viewer's clock).
 */
export function LocalTime({ iso, timeOnly = false }: { iso: string; timeOnly?: boolean }) {
  const date = new Date(iso);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {timeOnly
        ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : date.toLocaleString([], {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
    </time>
  );
}
