"use client";

import { useEffect, useState } from "react";

const SELECTED = "border border-b-0 border-edge bg-background";
// The same look from `lg` up, for a tab whose panel is shown beside the active one.
const SELECTED_LG = "lg:border lg:border-b-0 lg:border-edge lg:bg-background lg:text-foreground lg:hover:bg-background";
const UNSELECTED = "text-muted hover:bg-wash hover:text-foreground";

/**
 * Tab strip used by the merge workspace and the admin page. Inactive tabs
 * stay mounted (hidden) so stateful children — the collaborative editor,
 * chats, half-edited forms — keep their state across switches.
 *
 * Pass `ids` to make tabs hash-addressable: `#roster` selects that tab, and
 * in-page links (`<a href="#roster">`) switch tabs from anywhere.
 *
 * Pass `pinned` to show that tab's panel beside another from `lg` up: two
 * columns, in tab order, the pinned panel plus the active one (or, while the
 * pinned tab itself is active, the other tab last shown with it). Below `lg`
 * it is a plain one-panel tab strip. Panels are never duplicated — the same
 * element is only shown or hidden — so nothing inside mounts twice.
 *
 * Pass `fill` to stretch the tabs across the strip in equal widths, when
 * there is room (a tab never shrinks below its label; they wrap as before).
 */
export function Tabs({
  labels,
  ids,
  defaultIndex = 0,
  pinned,
  fill = false,
  children,
}: {
  labels: React.ReactNode[];
  ids?: string[];
  defaultIndex?: number;
  pinned?: number;
  fill?: boolean;
  children: React.ReactNode[];
}) {
  const [active, setActive] = useState(Math.min(defaultIndex, labels.length - 1));
  // The tab shown beside the pinned one when the pinned tab is active itself.
  const [companion, setCompanion] = useState(() => {
    const start = Math.min(defaultIndex, labels.length - 1);
    return start !== pinned ? start : labels.findIndex((_, i) => i !== pinned);
  });

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
    if (pinned !== undefined && i !== pinned) setCompanion(i);
    if (ids) {
      // No element carries these ids, so setting the hash never scroll-jumps.
      window.history.replaceState(null, "", `#${ids[i]}`);
      sessionStorage.setItem(`mt-tab:${window.location.pathname}`, ids[i]);
    }
  };

  const split = pinned !== undefined;
  // Shown from `lg` up: the pinned panel and the one beside it.
  const shownLg = (i: number) => split && (i === pinned || i === (active === pinned ? companion : active));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1 border-b border-edge" role="tablist">
        {labels.map((label, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={active === i}
            onClick={() => select(i)}
            className={`whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium sm:px-4 ${
              fill ? "min-w-max flex-1 text-center" : ""
            } ${active === i ? SELECTED : `${UNSELECTED} ${shownLg(i) ? SELECTED_LG : ""}`}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={split ? "lg:grid lg:grid-cols-2 lg:gap-6" : ""}>
        {children.map((child, i) => (
          <div
            key={i}
            className={`min-w-0 ${active === i ? "" : shownLg(i) ? "hidden lg:block" : "hidden"}`}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
