"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "../modal";
import { Tabs } from "./tabs";

const landedEvent = (flipKey: string) => `flip-landed:${flipKey}`;

/**
 * The performed coin flip (SPEC §4): a centered modal saying what is being
 * decided, flashing between the two choices faster and faster for about six
 * seconds, then showing the winner. Plays once per browser session per
 * flip; afterwards (and for later visitors) the static result renders.
 * `children` (the result) stays hidden while the coin is in the air.
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
          // Stays revealed until the viewer taps or clicks outside the modal.
          setPhase("revealed");
          window.dispatchEvent(new Event(landedEvent(flipKey)));
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
  }, [storageKey, flipKey]);

  if (phase === "done") return <>{children}</>;
  if (phase === "pending") return null;
  return (
    <>
      <Modal
        label="Coin flip"
        onDismiss={phase === "revealed" ? () => setPhase("done") : undefined}
        className="flex max-w-md flex-col items-center gap-4 p-8 text-center"
      >
        <span className="text-4xl" aria-hidden>
          🎲
        </span>
        <p className="text-sm text-muted">{title}</p>
        {phase === "animating" ? (
          <p className="min-h-[2.5rem] text-2xl font-bold">{face === 0 ? a : b}</p>
        ) : (
          <p className="min-h-[2.5rem] text-2xl font-bold text-live-ink">{winner}</p>
        )}
        {phase === "animating" ? (
          <p className="text-xs text-faint">the coin is in the air…</p>
        ) : (
          // A button as well as tapping outside: on a phone the card fills nearly the whole screen.
          <button
            type="button"
            onClick={() => setPhase("done")}
            className="rounded-md border border-line px-4 py-1.5 text-sm font-medium hover:bg-wash"
          >
            Close
          </button>
        )}
      </Modal>
      {/* The result behind the overlay would spoil the flip: withheld until the coin lands. */}
      {phase === "animating" ? <span className="text-muted">coin flip…</span> : children}
    </>
  );
}

/**
 * True while the flip keyed `flipKey` is still to land in this browser: from
 * the first render (so the server-rendered page never shows the result) until
 * FlipReveal lands it, or at once if this browser has already seen that flip.
 * False for no `flipKey`.
 */
function useFlipping(flipKey: string | null): boolean {
  const [flipping, setFlipping] = useState(flipKey !== null);
  useEffect(() => {
    // FlipReveal marks the flip seen only after this runs (in a timeout), so
    // a mark here means an earlier visit.
    const seen = flipKey === null || sessionStorage.getItem(`flip:${flipKey}`) !== null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage exists only on the client
    setFlipping(!seen);
    if (seen) return;
    const land = () => setFlipping(false);
    window.addEventListener(landedEvent(flipKey), land);
    return () => window.removeEventListener(landedEvent(flipKey), land);
  }, [flipKey]);
  return flipping;
}

/**
 * Withholds a part of the page that would spoil the flip keyed `flipKey` —
 * e.g. the merge's chat, whose system message names the result — until the
 * coin lands, or at once if this browser has already seen that flip. With no
 * `flipKey` it shows its children. Hidden, not removed: the space stays and
 * nothing inside remounts.
 */
export function HiddenWhileFlipping({ flipKey, children }: { flipKey: string | null; children: React.ReactNode }) {
  const hidden = useFlipping(flipKey);
  return <div className={hidden ? "invisible" : undefined}>{children}</div>;
}

/**
 * Leaves out a small mark that names the flip's result — a ✓ on a tab, a
 * "goes into the next round" tag — until the coin lands. Inline, and nothing
 * takes its place.
 */
export function ShownOnceLanded({ flipKey, children }: { flipKey: string | null; children: React.ReactNode }) {
  return useFlipping(flipKey) ? null : <>{children}</>;
}

/**
 * Tabs whose opening tab would give away a flip's result (the input that won
 * it): while the coin is in the air they open on `whileFlipping`, and once it
 * lands they move to `defaultIndex`, in place, so nothing typed meanwhile is lost.
 */
export function FlipAwareTabs({
  flipKey,
  whileFlipping,
  defaultIndex,
  ...rest
}: { flipKey: string | null; whileFlipping: number } & React.ComponentProps<typeof Tabs>) {
  const flipping = useFlipping(flipKey);
  return <Tabs defaultIndex={flipping ? whileFlipping : defaultIndex} {...rest} />;
}
