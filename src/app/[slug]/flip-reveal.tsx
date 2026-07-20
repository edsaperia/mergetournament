"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The performed coin flip (SPEC §4): a centered modal saying what is being
 * decided, flashing between the two choices faster and faster for about six
 * seconds, then showing the winner. Plays once per browser session per
 * flip; afterwards (and for later visitors) the static result renders.
 */
export function FlipReveal({
  flipKey,
  a,
  b,
  title,
  winner,
  children,
}: {
  flipKey: string;
  a: string;
  b: string;
  /** What this flip decides, e.g. "Deciding who carries this merge into round 2". */
  title: string;
  /** Label of the winning choice, shown at the reveal. */
  winner: string;
  children: React.ReactNode;
}) {
  const storageKey = `flip:${flipKey}`;
  const [phase, setPhase] = useState<"pending" | "animating" | "revealed" | "done">("pending");
  const [face, setFace] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const TOTAL = 6000;
    timer.current = setTimeout(() => {
      if (cancelled) return;
      if (sessionStorage.getItem(storageKey)) {
        setPhase("done");
        return;
      }
      sessionStorage.setItem(storageKey, "1");
      setPhase("animating");
      const started = Date.now();
      const step = () => {
        if (cancelled) return;
        const elapsed = Date.now() - started;
        if (elapsed >= TOTAL) {
          // Stays revealed until the viewer clicks outside the modal.
          setPhase("revealed");
          return;
        }
        setFace((f) => 1 - f);
        // Faster and faster: 500ms flashes accelerating to 60ms.
        const delay = Math.max(60, 500 - (440 * elapsed) / TOTAL);
        timer.current = setTimeout(step, delay);
      };
      step();
    }, 0);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [storageKey]);

  if (phase === "done") return <>{children}</>;
  if (phase === "pending") return null;
  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={() => {
          if (phase === "revealed") setPhase("done");
        }}
      >
        <div
          className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-edge bg-background p-8 text-center shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-4xl" aria-hidden>
            🪙
          </span>
          <p className="text-sm text-muted">{title}</p>
          {phase === "animating" ? (
            <p className="min-h-[2.5rem] text-2xl font-bold">{face === 0 ? a : b}</p>
          ) : (
            <p className="min-h-[2.5rem] text-2xl font-bold text-live-ink">{winner}</p>
          )}
          <p className="text-xs text-faint">
            {phase === "animating" ? "the coin is in the air…" : "decided — click outside to dismiss"}
          </p>
        </div>
      </div>
      {children}
    </>
  );
}
