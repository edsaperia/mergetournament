"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The "About this tournament" fold: open on a visitor's first ever look at
 * this tournament, then it stays however they left it (per browser, per
 * slug). Server-renders open, so no-JS readers always see the brief.
 */
export function IntroFold({ slug, children }: { slug: string; children: React.ReactNode }) {
  const key = `mt-intro:${slug}`;
  const [open, setOpen] = useState(true);
  const restored = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage exists only on the client; correct after hydration
    if (stored) setOpen(stored === "open");
    restored.current = true;
  }, [key]);

  return (
    <details
      open={open}
      onToggle={(e) => {
        const isOpen = e.currentTarget.open;
        setOpen(isOpen);
        // The restore above also fires toggle; only user flips persist.
        if (restored.current) localStorage.setItem(key, isOpen ? "open" : "closed");
      }}
      className="rounded-md border border-edge px-4 py-3 text-sm"
    >
      <summary className="cursor-pointer font-semibold">About this tournament</summary>
      <p className="mt-2 whitespace-pre-wrap text-soft">{children}</p>
    </details>
  );
}
