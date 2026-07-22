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
    key: "default",
    name: "Default",
    blurb: "The stock black-and-white look",
    overrides: Object.fromEntries(THEME_TOKENS.map((t) => [t.key, { light: t.light, dark: t.dark }])),
  },
  {
    key: "parchment",
    name: "Parchment",
    blurb: "Warm paper and oxblood ink — founding-document energy",
    overrides: preset({
      background: ["#f5efdd", "#191512"],
      panel: ["#ece4cd", "#231d16"],
      wash: ["#f1ead5", "#231d16"],
      foreground: ["#2b2416", "#eee4cd"],
      soft: ["#55492f", "#d3c6a4"],
      muted: ["#82734f", "#9f9271"],
      faint: ["#ab9d77", "#6f6549"],
      edge: ["#e5dcc3", "#352c1f"],
      "edge-faint": ["#ece4cd", "#231d16"],
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
      background: ["#f6f8fa", "#0b1120"],
      panel: ["#e7ecf1", "#131c31"],
      wash: ["#eef2f6", "#131c31"],
      foreground: ["#0f172a", "#e2e8f0"],
      soft: ["#334155", "#cbd5e1"],
      muted: ["#64748b", "#94a3b8"],
      faint: ["#94a3b8", "#64748b"],
      edge: ["#dbe2ea", "#1e293b"],
      "edge-faint": ["#e7ecf1", "#131c31"],
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
      background: ["#eff4ec", "#111811"],
      panel: ["#e1e9dd", "#1a231a"],
      wash: ["#e9efe4", "#1a231a"],
      foreground: ["#1c2a1e", "#e2ece2"],
      soft: ["#3d5244", "#c2d2c3"],
      muted: ["#6b8071", "#8aa08d"],
      faint: ["#9cab9f", "#5d6f60"],
      edge: ["#d3e0cf", "#283628"],
      "edge-faint": ["#e1e9dd", "#1a231a"],
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
      background: ["#f3f1fa", "#100d1c"],
      panel: ["#e8e5f3", "#191527"],
      wash: ["#eeebf7", "#191527"],
      foreground: ["#1e1b2e", "#e8e5f4"],
      soft: ["#46405e", "#cdc7e2"],
      muted: ["#736c8c", "#948cb0"],
      faint: ["#a29bb8", "#645c80"],
      edge: ["#ddd8ec", "#262038"],
      "edge-faint": ["#e8e5f3", "#191527"],
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
      background: ["#f7f2ec", "#171210"],
      panel: ["#eee6db", "#211a16"],
      wash: ["#f3ece3", "#211a16"],
      foreground: ["#241d18", "#f0e6df"],
      soft: ["#52453c", "#d8c9be"],
      muted: ["#7f6f63", "#a08f82"],
      faint: ["#ab9c90", "#6f6156"],
      edge: ["#e3d6c8", "#322822"],
      "edge-faint": ["#eee6db", "#211a16"],
      line: ["#d3c3b5", "#473a31"],
      strong: ["#7f6f63", "#a08f82"],
      accent: ["#c2410c", "#fb923c"],
      "accent-ink": ["#fff7ed", "#1c130c"],
      "accent-soft": ["#9a3412", "#fdba74"],
      live: ["#e11d48", "#fb7185"],
      "live-ink": ["#be123c", "#fda4af"],
    }),
  },
  {
    key: "pastels",
    name: "Pastels",
    blurb: "Soft lavender, pink, and mint — gentle on everyone",
    overrides: preset({
      background: ["#f7eef4", "#241c26"],
      panel: ["#efe1eb", "#2f2531"],
      wash: ["#f3e8f0", "#2f2531"],
      foreground: ["#4a3d4a", "#f0e4ee"],
      soft: ["#6e5a6e", "#d9c6d6"],
      muted: ["#978197", "#a78fa4"],
      faint: ["#bfa9bf", "#776377"],
      edge: ["#e8d4e2", "#3d2f3f"],
      "edge-faint": ["#efe1eb", "#2f2531"],
      line: ["#e2c8dc", "#554256"],
      strong: ["#978197", "#a78fa4"],
      accent: ["#b05580", "#e8a7c7"],
      "accent-ink": ["#ffffff", "#2a1c26"],
      "accent-soft": ["#c2648f", "#f0bcd6"],
      live: ["#5da79a", "#8ed0c2"],
      "live-ink": ["#47857a", "#aaddd2"],
    }),
  },
  {
    key: "cyberpunk",
    name: "Cyberpunk",
    blurb: "Neon magenta and cyan on near-black",
    overrides: preset({
      background: ["#ececf3", "#0a0612"],
      panel: ["#e0e0eb", "#140d20"],
      wash: ["#e6e6ef", "#140d20"],
      foreground: ["#16121f", "#e8e3f8"],
      soft: ["#3c3452", "#c9beea"],
      muted: ["#6a5f8a", "#8d7fc0"],
      faint: ["#9a90b8", "#5c4f8a"],
      edge: ["#d2cfe2", "#241738"],
      "edge-faint": ["#e0e0eb", "#140d20"],
      line: ["#c2bcdd", "#382657"],
      strong: ["#6a5f8a", "#8d7fc0"],
      accent: ["#d600aa", "#ff2fd6"],
      "accent-ink": ["#ffffff", "#170320"],
      "accent-soft": ["#a80086", "#ff64e1"],
      live: ["#0891b2", "#22d3ee"],
      "live-ink": ["#0e7490", "#67e8f9"],
    }),
  },
  {
    key: "corporate",
    name: "Corporate",
    blurb: "Steel blue and slate — quarterly-review sobriety",
    overrides: preset({
      background: ["#f3f5f7", "#12181f"],
      panel: ["#e5eaee", "#1b242e"],
      wash: ["#edf0f3", "#1b242e"],
      foreground: ["#1f2933", "#e1e7ed"],
      soft: ["#3e4c59", "#c3ccd6"],
      muted: ["#7b8794", "#8895a3"],
      faint: ["#9aa5b1", "#5b6672"],
      edge: ["#d5dde4", "#2a3642"],
      "edge-faint": ["#e5eaee", "#1b242e"],
      line: ["#cbd2d9", "#3d4b5a"],
      strong: ["#7b8794", "#8895a3"],
      accent: ["#2c5282", "#7fb3d8"],
      "accent-ink": ["#ffffff", "#101820"],
      "accent-soft": ["#2a4365", "#a3c9e4"],
      live: ["#2b6cb0", "#63b3ed"],
      "live-ink": ["#2c5282", "#90cdf4"],
    }),
  },
  {
    key: "sparkles",
    name: "Sparkles",
    blurb: "Hot pink and gold — democracy, but make it fun",
    overrides: preset({
      background: ["#faf1f5", "#241420"],
      panel: ["#f4e1ec", "#301b2b"],
      wash: ["#f7eaf1", "#301b2b"],
      foreground: ["#46243a", "#f7e6f0"],
      soft: ["#6d3c5c", "#e3c4d7"],
      muted: ["#9c6787", "#b388a3"],
      faint: ["#c398b2", "#7d5a71"],
      edge: ["#efd2e2", "#402537"],
      "edge-faint": ["#f4e1ec", "#301b2b"],
      line: ["#f0c3da", "#593350"],
      strong: ["#9c6787", "#b388a3"],
      accent: ["#d63384", "#f472b6"],
      "accent-ink": ["#ffffff", "#2a0f1f"],
      "accent-soft": ["#b02a6c", "#f9a8d4"],
      live: ["#d4a017", "#fbbf24"],
      "live-ink": ["#a87d0d", "#fcd34d"],
    }),
  },
  {
    key: "console",
    name: "Console",
    blurb: "Green phosphor on black, in both modes — sudo merge",
    overrides: preset({
      background: ["#0c0f0c", "#0c0f0c"],
      panel: ["#131813", "#131813"],
      wash: ["#131813", "#131813"],
      foreground: ["#4af626", "#4af626"],
      soft: ["#3fd120", "#3fd120"],
      muted: ["#2f9e18", "#2f9e18"],
      faint: ["#1f6b10", "#1f6b10"],
      edge: ["#1d2a1d", "#1d2a1d"],
      "edge-faint": ["#131813", "#131813"],
      line: ["#2a3d2a", "#2a3d2a"],
      strong: ["#2f9e18", "#2f9e18"],
      accent: ["#4af626", "#4af626"],
      "accent-ink": ["#0c0f0c", "#0c0f0c"],
      "accent-soft": ["#6dff4a", "#6dff4a"],
      live: ["#2ee6c8", "#2ee6c8"],
      "live-ink": ["#5cf0d8", "#5cf0d8"],
    }),
  },
  {
    key: "bootstrap",
    name: "Bootstrap",
    blurb: "That blue. Those grays. You know the one",
    overrides: preset({
      background: ["#f4f5f6", "#212529"],
      panel: ["#e9ecef", "#2b3035"],
      wash: ["#eef0f2", "#2b3035"],
      foreground: ["#212529", "#dee2e6"],
      soft: ["#495057", "#ced4da"],
      muted: ["#6c757d", "#adb5bd"],
      faint: ["#adb5bd", "#6c757d"],
      edge: ["#d8dce0", "#343a40"],
      "edge-faint": ["#e9ecef", "#2b3035"],
      line: ["#ced4da", "#495057"],
      strong: ["#6c757d", "#adb5bd"],
      accent: ["#0d6efd", "#6ea8fe"],
      "accent-ink": ["#ffffff", "#031633"],
      "accent-soft": ["#0b5ed7", "#9ec5fe"],
      live: ["#198754", "#75b798"],
      "live-ink": ["#146c43", "#a3cfbb"],
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
