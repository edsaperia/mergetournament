import { describe, expect, it } from "vitest";
import { THEME_PRESETS, THEME_TOKENS, themeCss, validateTheme } from "./theme";

describe("theme validation", () => {
  it("accepts known tokens with strict hex and rejects everything else", () => {
    expect(validateTheme({ accent: { light: "#6495ed", dark: "#a3bffa" } })).toEqual({
      accent: { light: "#6495ed", dark: "#a3bffa" },
    });
    expect(() => validateTheme({ nonsense: { light: "#000000", dark: "#000000" } })).toThrow(/unknown/);
    expect(() => validateTheme({ accent: { light: "red", dark: "#000000" } })).toThrow(/rrggbb/);
    expect(() => validateTheme({ accent: { light: "#000;} body{display:none", dark: "#000000" } })).toThrow(/rrggbb/);
    expect(() => validateTheme("hax")).toThrow(/object/);
    expect(() => validateTheme([1])).toThrow(/object/);
  });

  it("emits scoped CSS custom properties and nothing else", () => {
    const css = themeCss({ accent: { light: "#6495ed", dark: "#a3bffa" }, panel: { light: "#eeeeff", dark: "#111122" } });
    expect(css).toBe(":root{--color-accent: light-dark(#6495ed, #a3bffa);--color-panel: light-dark(#eeeeff, #111122);}");
    expect(themeCss({})).toBe("");
  });

  it("covers every token with valid hex defaults", () => {
    for (const t of THEME_TOKENS) {
      expect(t.light).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.dark).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(new Set(THEME_TOKENS.map((t) => t.key)).size).toBe(THEME_TOKENS.length);
  });
});

describe("theme presets", () => {
  it("every preset covers every core token and passes validation", () => {
    // Status and comment tokens are deliberately stock in presets — warnings
    // must read the same in every palette. The default preset covers all.
    const core = THEME_TOKENS.filter((t) => t.group !== "Status" && t.group !== "Comments")
      .map((t) => t.key)
      .sort();
    const all = THEME_TOKENS.map((t) => t.key).sort();
    for (const p of THEME_PRESETS) {
      const covered = Object.keys(p.overrides).sort();
      expect(covered, p.name).toEqual(p.key === "default" ? all : core);
      expect(() => validateTheme(p.overrides), p.name).not.toThrow();
      expect(themeCss(p.overrides)).toContain("--color-accent:");
    }
  });

  it("preset keys and names are unique", () => {
    expect(new Set(THEME_PRESETS.map((p) => p.key)).size).toBe(THEME_PRESETS.length);
    expect(new Set(THEME_PRESETS.map((p) => p.name)).size).toBe(THEME_PRESETS.length);
  });
});
