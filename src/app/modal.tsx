"use client";

import { useEffect, useRef } from "react";

/**
 * The one modal: fixed dimmed overlay, centered card, focus moved into the
 * card for keyboard users. Pass `onDismiss` to allow click-outside + Escape;
 * omit it for modals that only the system may remove (the pause overlay).
 * The card is unpadded — content brings its own layout.
 */
export function Modal({
  onDismiss,
  label,
  blur = false,
  className = "max-w-md",
  children,
}: {
  onDismiss?: () => void;
  /** Accessible name for the dialog. */
  label: string;
  /** Blur the page behind (the pause overlay). */
  blur?: boolean;
  /** Card sizing/layout classes; defaults to max-w-md. */
  className?: string;
  children: React.ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    card.current?.focus();
    if (!onDismiss) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onDismiss}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 ${blur ? "backdrop-blur-md" : ""}`}
    >
      <div
        ref={card}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[85vh] w-full overflow-y-auto rounded-xl border border-edge bg-background shadow-2xl outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
