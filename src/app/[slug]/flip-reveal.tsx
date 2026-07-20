"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The performed coin flip (SPEC §4): flashes between the two choices,
 * faster and faster, revealing the winner after about six seconds. Plays
 * once per browser session per flip; afterwards renders the static result.
 */
export function FlipReveal({
  flipKey,
  a,
  b,
  children,
}: {
  flipKey: string;
  a: string;
  b: string;
  children: React.ReactNode;
}) {
  const storageKey = `flip:${flipKey}`;
  const [phase, setPhase] = useState<"pending" | "animating" | "done">("pending");
  const [face, setFace] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (sessionStorage.getItem(storageKey)) {
      setPhase("done");
      return;
    }
    sessionStorage.setItem(storageKey, "1");
    setPhase("animating");

    const TOTAL = 6000;
    const started = Date.now();
    const step = () => {
      if (cancelled) return;
      const elapsed = Date.now() - started;
      if (elapsed >= TOTAL) {
        setPhase("done");
        return;
      }
      setFace((f) => 1 - f);
      // Faster and faster: 500ms flashes accelerating to 60ms.
      const delay = Math.max(60, 500 - (440 * elapsed) / TOTAL);
      timer.current = setTimeout(step, delay);
    };
    step();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [storageKey]);

  if (phase === "done") return <>{children}</>;
  if (phase === "pending") return null;
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
      <span aria-hidden>🪙</span>
      <span aria-live="off">{face === 0 ? a : b}</span>
    </span>
  );
}
