"use client";

import { useEffect, useState } from "react";

/**
 * Tab strip used by the merge workspace and the admin page. Inactive tabs
 * stay mounted (hidden) so stateful children — the collaborative editor,
 * chats, half-edited forms — keep their state across switches.
 *
 * Pass `ids` to make tabs hash-addressable: `#roster` selects that tab, and
 * in-page links (`<a href="#roster">`) switch tabs from anywhere.
 */
export function Tabs({
  labels,
  ids,
  defaultIndex = 0,
  children,
}: {
  labels: string[];
  ids?: string[];
  defaultIndex?: number;
  children: React.ReactNode[];
}) {
  const [active, setActive] = useState(Math.min(defaultIndex, labels.length - 1));

  useEffect(() => {
    if (!ids) return;
    const storeKey = `mt-tab:${window.location.pathname}`;
    const fromHash = () => {
      const i = ids.indexOf(window.location.hash.slice(1));
      if (i >= 0) {
        setActive(i);
        sessionStorage.setItem(storeKey, ids[i]);
      }
    };
    // Hash wins; otherwise restore the last tab for this page — form posts
    // and re-renders must not dump the user back on the first tab. Both
    // sources exist only on the client, so this must correct after
    // hydration rather than in the initial render.
    const initial = ids.includes(window.location.hash.slice(1))
      ? ids.indexOf(window.location.hash.slice(1))
      : ids.indexOf(sessionStorage.getItem(storeKey) ?? "");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    if (initial >= 0) setActive(initial);
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [ids]);

  const select = (i: number) => {
    setActive(i);
    if (ids) {
      // No element carries these ids, so setting the hash never scroll-jumps.
      window.history.replaceState(null, "", `#${ids[i]}`);
      sessionStorage.setItem(`mt-tab:${window.location.pathname}`, ids[i]);
    }
  };

  return (
    <div>
      <div className="mb-3 flex gap-1 border-b border-edge" role="tablist">
        {labels.map((label, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={active === i}
            onClick={() => select(i)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              active === i
                ? "border border-b-0 border-edge bg-background"
                : "text-muted hover:bg-wash hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {children.map((child, i) => (
        <div key={i} className={active === i ? "" : "hidden"}>
          {child}
        </div>
      ))}
    </div>
  );
}
