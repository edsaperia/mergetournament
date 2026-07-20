"use client";

import { useState, useTransition } from "react";
import { updateThemeAction, type ActionState } from "../../../server/actions";
import { THEME_PRESETS, THEME_TOKENS, type ThemeOverrides } from "../../../lib/theme";
import { btnPrimary, btnSecondary } from "../../ui";

/**
 * Per-tournament colors: every design token, light and dark, defaulting to
 * the site's stock values. Saving applies to this tournament's pages only.
 */
export function ThemeEditor({ slug, current }: { slug: string; current: ThemeOverrides | null }) {
  const [values, setValues] = useState<ThemeOverrides>(() => {
    const out: ThemeOverrides = {};
    for (const t of THEME_TOKENS) {
      out[t.key] = current?.[t.key] ?? { light: t.light, dark: t.dark };
    }
    return out;
  });
  const [status, setStatus] = useState<ActionState>({ ok: true, message: "" });
  const [pending, startTransition] = useTransition();

  const set = (key: string, mode: "light" | "dark", color: string) =>
    setValues((v) => ({ ...v, [key]: { ...v[key], [mode]: color } }));

  const save = () => startTransition(async () => setStatus(await updateThemeAction(slug, values)));
  const reset = () =>
    startTransition(async () => {
      const result = await updateThemeAction(slug, null);
      if (result.ok) {
        const out: ThemeOverrides = {};
        for (const t of THEME_TOKENS) out[t.key] = { light: t.light, dark: t.dark };
        setValues(out);
      }
      setStatus(result);
    });

  const applyPreset = (overrides: ThemeOverrides) => {
    setValues((v) => ({ ...v, ...overrides }));
    setStatus({ ok: true, message: "Preset loaded — press Save theme to apply it." });
  };

  const groups = [...new Set(THEME_TOKENS.map((t) => t.group))];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted">Presets</h3>
        <div className="flex flex-wrap gap-2">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              title={p.blurb}
              onClick={() => applyPreset(p.overrides)}
              className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm hover:border-strong"
            >
              <span className="flex overflow-hidden rounded-full border border-line">
                {["background", "accent", "live"].map((k) => (
                  <span key={k} className="h-4 w-4" style={{ backgroundColor: p.overrides[k].light }} />
                ))}
                <span className="h-4 w-4" style={{ backgroundColor: p.overrides.background.dark }} />
                <span className="h-4 w-4" style={{ backgroundColor: p.overrides.accent.dark }} />
              </span>
              {p.name}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          Loads the palette into the pickers below — tweak anything, then save.
        </p>
      </div>
      {groups.map((group) => (
        <div key={group}>
          <h3 className="mb-2 text-sm font-semibold text-muted">{group}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {THEME_TOKENS.filter((t) => t.group === group).map((t) => (
              <div key={t.key} className="flex items-center justify-between gap-3 rounded-md border border-edge px-3 py-2 text-sm">
                <span>{t.label}</span>
                <span className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-muted">
                    light
                    <input
                      type="color"
                      value={values[t.key].light}
                      onChange={(e) => set(t.key, "light", e.target.value)}
                      className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted">
                    dark
                    <input
                      type="color"
                      value={values[t.key].dark}
                      onChange={(e) => set(t.key, "dark", e.target.value)}
                      className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent"
                    />
                  </label>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btnPrimary} disabled={pending} onClick={save}>
          Save theme
        </button>
        <button type="button" className={btnSecondary} disabled={pending} onClick={reset}>
          Reset to defaults
        </button>
        {status.message && (
          <span className={status.ok ? "text-sm text-muted" : "text-sm text-red-600"}>{status.message}</span>
        )}
      </div>
    </div>
  );
}
