"use client";

import { useState } from "react";

type Mode = "auto" | "light" | "dark";
const ORDER: Mode[] = ["auto", "light", "dark"];
const ICON: Record<Mode, string> = { auto: "◐", light: "☀", dark: "☾" };
const TITLE: Record<Mode, string> = {
  auto: "Theme: follow system (click for light)",
  light: "Theme: light (click for dark)",
  dark: "Theme: dark (click for system)",
};

function apply(mode: Mode) {
  document.documentElement.style.colorScheme = mode === "auto" ? "light dark" : mode;
}

/**
 * Light/dark/system switcher. Every color is a light-dark() token, so
 * forcing color-scheme flips the whole page. An inline script in the root
 * layout applies the stored choice before first paint.
 */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "auto";
    const stored = localStorage.getItem("mt-theme");
    return stored === "light" || stored === "dark" ? stored : "auto";
  });

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(next);
    if (next === "auto") localStorage.removeItem("mt-theme");
    else localStorage.setItem("mt-theme", next);
    apply(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      title={TITLE[mode]}
      aria-label={TITLE[mode]}
      suppressHydrationWarning
      className="text-lg text-muted transition-colors hover:text-foreground"
    >
      {ICON[mode]}
    </button>
  );
}
