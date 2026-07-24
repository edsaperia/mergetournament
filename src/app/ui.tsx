/** Shared controls, built from the tokens in globals.css. */

import type { ButtonHTMLAttributes } from "react";

const VARIANT = {
  primary: "bg-accent text-accent-ink hover:bg-accent-soft",
  secondary: "border border-line hover:bg-panel",
} as const;

const SIZE = {
  sm: "rounded-md px-2.5 py-1.5 text-sm",
  md: "rounded-lg px-4 py-2 text-sm",
  lg: "rounded-lg px-5 py-3",
} as const;

/**
 * The button. Renders a native <button>, so name/value/formAction/onClick
 * all pass straight through; style with variant + size, never raw classes.
 */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
}) {
  return (
    <button
      className={`font-medium disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    />
  );
}

export const field = "w-full rounded-md border border-line px-3 py-2";

export const fieldLabel = "mb-1 block text-sm font-medium";
