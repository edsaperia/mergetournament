"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Live updates via SSE (SPEC §7): refresh server data whenever the
 * tournament's event stream says something changed, with a slow safety-net
 * poll in case the stream drops. EventSource reconnects automatically.
 */
export function AutoRefresh({ slug, fallbackMs = 30000 }: { slug: string; fallbackMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const source = new EventSource(`/${slug}/events`);
    source.onmessage = (e) => {
      if (e.data === "changed") router.refresh();
    };
    const fallback = setInterval(() => router.refresh(), fallbackMs);
    return () => {
      source.close();
      clearInterval(fallback);
    };
  }, [router, slug, fallbackMs]);
  return null;
}

function fmt(s: number): string {
  const sign = s < 0 ? "-" : "";
  const abs = Math.max(0, Math.abs(s));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const sec = Math.floor(abs % 60);
  return h > 0
    ? `${sign}${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${sign}${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Ticking countdown seeded from server-computed remaining seconds; the
 * AutoRefresh poll corrects drift. Frozen while paused.
 */
export function Countdown({
  remainingS,
  paused = false,
  className = "",
}: {
  remainingS: number;
  paused?: boolean;
  className?: string;
}) {
  const [renderedAt] = useState(() => Date.now());
  const [, force] = useState(0);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [paused]);
  const left = paused ? remainingS : remainingS - (Date.now() - renderedAt) / 1000;
  return (
    <span className={`tabular-nums font-mono ${paused ? "opacity-50" : ""} ${className}`}>
      {fmt(left)}
      {paused && " (paused)"}
    </span>
  );
}
