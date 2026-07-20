/**
 * The design tokens as data: single source for the theme editor, validation,
 * and per-tournament CSS overrides. Keep in sync with the @theme block in
 * src/app/globals.css (the build-time defaults).
 */

import { DomainError } from "./errors";

export interface ThemeToken {
  key: string;
  label: string;
  group: string;
  light: string;
  dark: string;
}

export const THEME_TOKENS: ThemeToken[] = [
  { key: "background", label: "Page background", group: "Surfaces", light: "#ffffff", dark: "#0a0a0a" },
  { key: "panel", label: "Raised panels", group: "Surfaces", light: "#f5f5f5", dark: "#171717" },
  { key: "wash", label: "Hover wash", group: "Surfaces", light: "#fafafa", dark: "#171717" },
  { key: "foreground", label: "Body text", group: "Text", light: "#171717", dark: "#ededed" },
  { key: "soft", label: "Secondary text", group: "Text", light: "#525252", dark: "#d4d4d4" },
  { key: "muted", label: "Metadata text", group: "Text", light: "#737373", dark: "#737373" },
  { key: "faint", label: "Placeholder text", group: "Text", light: "#a3a3a3", dark: "#a3a3a3" },
  { key: "edge", label: "Section borders", group: "Borders", light: "#e5e5e5", dark: "#262626" },
  { key: "edge-faint", label: "Hairlines", group: "Borders", light: "#f5f5f5", dark: "#171717" },
  { key: "line", label: "Control borders", group: "Borders", light: "#d4d4d4", dark: "#404040" },
  { key: "strong", label: "Hovered borders", group: "Borders", light: "#737373", dark: "#737373" },
  { key: "accent", label: "Primary buttons", group: "Accent", light: "#171717", dark: "#ffffff" },
  { key: "accent-ink", label: "Primary button text", group: "Accent", light: "#ffffff", dark: "#171717" },
  { key: "accent-soft", label: "Primary button hover", group: "Accent", light: "#404040", dark: "#e5e5e5" },
  { key: "live", label: "You-are-here highlight", group: "Live", light: "#3b82f6", dark: "#60a5fa" },
  { key: "live-ink", label: "You-are-here text", group: "Live", light: "#2563eb", dark: "#93c5fd" },
];

/** token key -> { light, dark } hex overrides. */
export type ThemeOverrides = Record<string, { light: string; dark: string }>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const KEYS = new Set(THEME_TOKENS.map((t) => t.key));

/** Throws unless every entry is a known token with strict hex values. */
export function validateTheme(theme: unknown): ThemeOverrides {
  if (typeof theme !== "object" || theme === null || Array.isArray(theme)) {
    throw new DomainError("theme must be an object");
  }
  const out: ThemeOverrides = {};
  for (const [key, value] of Object.entries(theme)) {
    if (!KEYS.has(key)) throw new DomainError(`unknown theme token: ${key}`);
    const { light, dark } = (value ?? {}) as { light?: string; dark?: string };
    if (typeof light !== "string" || !HEX.test(light) || typeof dark !== "string" || !HEX.test(dark)) {
      throw new DomainError(`token ${key}: colors must be #rrggbb`);
    }
    out[key] = { light, dark };
  }
  return out;
}

/**
 * CSS overriding the token variables for a tournament. Values are
 * re-validated here â€” nothing unvalidated ever reaches a style tag.
 */
export function themeCss(theme: ThemeOverrides): string {
  const safe = validateTheme(theme);
  const lines = Object.entries(safe).map(
    ([key, v]) => `--color-${key}: light-dark(${v.light}, ${v.dark});`
  );
  return lines.length > 0 ? `:root{${lines.join("")}}` : "";
}
