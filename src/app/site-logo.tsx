"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";

/** Reserved first path segments that are not tournament slugs. */
const NON_TOURNAMENT = new Set(["", "new", "sysadmin", "healthz", "api"]);

/**
 * Top-left logo on every page: inside a tournament it goes to that
 * tournament's home; elsewhere, to the global homepage.
 */
export function SiteLogo() {
  const pathname = usePathname() ?? "/";
  const first = pathname.split("/")[1] ?? "";
  const href = NON_TOURNAMENT.has(first) ? "/" : `/${first}`;
  return (
    <Link href={href} aria-label="Home" className="inline-block text-foreground transition-opacity hover:opacity-60">
      <Logo className="h-8 w-8" />
    </Link>
  );
}
