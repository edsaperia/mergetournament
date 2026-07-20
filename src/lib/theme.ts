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

export interface ThemePreset {
  key: string;
  name: string;
  blurb: string;
  overrides: ThemeOverrides;
}

/** Shorthand: build a full override set from per-token [light, dark] pairs. */
function preset(pairs: Record<string, [string, string]>): ThemeOverrides {
  return Object.fromEntries(Object.entries(pairs).map(([k, [light, dark]]) => [k, { light, dark }]));
}

/**
 * Ready-made palettes covering every token, applied via the theme editor
 * (they load into the pickers; saving is still explicit). Each is tuned for
 * both modes: dark accents flip to lighter hues so button text stays legible.
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    key: "parchment",
    name: "Parchment",
    blurb: "Warm paper and oxblood ink — founding-document energy",
    overrides: preset({
      background: ["#faf6ec", "#191512"],
      panel: ["#f2ecdb", "#231d16"],
      wash: ["#f6f0e2", "#231d16"],
      foreground: ["#2b2416", "#eee4cd"],
      soft: ["#55492f", "#d3c6a4"],
      muted: ["#82734f", "#9f9271"],
      faint: ["#ab9d77", "#6f6549"],
      edge: ["#e5dcc3", "#352c1f"],
      "edge-faint": ["#f2ecdb", "#231d16"],
      line: ["#cfc19c", "#4a3e2c"],
      strong: ["#82734f", "#9f9271"],
      accent: ["#7c2d12", "#d4a24a"],
      "accent-ink": ["#faf6ec", "#201709"],
      "accent-soft": ["#9a3412", "#c08f36"],
      live: ["#b45309", "#d97706"],
      "live-ink": ["#92400e", "#fbbf24"],
    }),
  },
  {
    key: "forum",
    name: "Forum",
    blurb: "Civic slate and navy — public-service sobriety",
    overrides: preset({
      background: ["#ffffff", "#0b1120"],
      panel: ["#f1f5f9", "#131c31"],
      wash: ["#f8fafc", "#131c31"],
      foreground: ["#0f172a", "#e2e8f0"],
      soft: ["#334155", "#cbd5e1"],
      muted: ["#64748b", "#94a3b8"],
      faint: ["#94a3b8", "#64748b"],
      edge: ["#e2e8f0", "#1e293b"],
      "edge-faint": ["#f1f5f9", "#131c31"],
      line: ["#cbd5e1", "#334155"],
      strong: ["#64748b", "#94a3b8"],
      accent: ["#1d4ed8", "#60a5fa"],
      "accent-ink": ["#ffffff", "#0b1120"],
      "accent-soft": ["#1e40af", "#93c5fd"],
      live: ["#0284c7", "#38bdf8"],
      "live-ink": ["#0369a1", "#7dd3fc"],
    }),
  },
  {
    key: "verdigris",
    name: "Verdigris",
    blurb: "Sage and deep green — patient, growing consensus",
    overrides: preset({
      background: ["#f6f9f4", "#111811"],
      panel: ["#eaf1e8", "#1a231a"],
      wash: ["#f1f6ee", "#1a231a"],
      foreground: ["#1c2a1e", "#e2ece2"],
      soft: ["#3d5244", "#c2d2c3"],
      muted: ["#6b8071", "#8aa08d"],
      faint: ["#9cab9f", "#5d6f60"],
      edge: ["#dbe6d8", "#283628"],
      "edge-faint": ["#eaf1e8", "#1a231a"],
      line: ["#c0d1bc", "#3a4c3b"],
      strong: ["#6b8071", "#8aa08d"],
      accent: ["#166534", "#4ade80"],
      "accent-ink": ["#f6f9f4", "#0c150c"],
      "accent-soft": ["#15803d", "#86efac"],
      live: ["#0d9488", "#2dd4bf"],
      "live-ink": ["#0f766e", "#5eead4"],
    }),
  },
  {
    key: "midnight",
    name: "Midnight",
    blurb: "Violet and fuchsia — for the late-night drafting session",
    overrides: preset({
      background: ["#faf9fe", "#100d1c"],
      panel: ["#f1effa", "#191527"],
      wash: ["#f6f4fc", "#191527"],
      foreground: ["#1e1b2e", "#e8e5f4"],
      soft: ["#46405e", "#cdc7e2"],
      muted: ["#736c8c", "#948cb0"],
      faint: ["#a29bb8", "#645c80"],
      edge: ["#e4e0f0", "#262038"],
      "edge-faint": ["#f1effa", "#191527"],
      line: ["#cdc6e2", "#3a3354"],
      strong: ["#736c8c", "#948cb0"],
      accent: ["#6d28d9", "#a78bfa"],
      "accent-ink": ["#ffffff", "#100d1c"],
      "accent-soft": ["#5b21b6", "#c4b5fd"],
      live: ["#c026d3", "#e879f9"],
      "live-ink": ["#a21caf", "#f0abfc"],
    }),
  },
  {
    key: "ember",
    name: "Ember",
    blurb: "Warm charcoal and flame orange — urgency with warmth",
    overrides: preset({
      background: ["#fdfaf7", "#171210"],
      panel: ["#f5efe9", "#211a16"],
      wash: ["#f9f4ef", "#211a16"],
      foreground: ["#241d18", "#f0e6df"],
      soft: ["#52453c", "#d8c9be"],
      muted: ["#7f6f63", "#a08f82"],
      faint: ["#ab9c90", "#6f6156"],
      edge: ["#e9ded4", "#322822"],
      "edge-faint": ["#f5efe9", "#211a16"],
      line: ["#d3c3b5", "#473a31"],
      strong: ["#7f6f63", "#a08f82"],
      accent: ["#c2410c", "#fb923c"],
      "accent-ink": ["#fff7ed", "#1c130c"],
      "accent-soft": ["#9a3412", "#fdba74"],
      live: ["#e11d48", "#fb7185"],
      "live-ink": ["#be123c", "#fda4af"],
    }),
  },
];

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
 * re-validated here — nothing unvalidated ever reaches a style tag.
 */
export function themeCss(theme: ThemeOverrides): string {
  const safe = validateTheme(theme);
  const lines = Object.entries(safe).map(
    ([key, v]) => `--color-${key}: light-dark(${v.light}, ${v.dark});`
  );
  return lines.length > 0 ? `:root{${lines.join("")}}` : "";
}
