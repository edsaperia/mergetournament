"use client";

import { useState } from "react";

/**
 * Tab strip used by the merge workspace and the admin page. Inactive tabs
 * stay mounted (hidden) so stateful children — the collaborative editor,
 * chats, half-edited forms — keep their state across switches.
 */
export function Tabs({
  labels,
  defaultIndex = 0,
  children,
}: {
  labels: string[];
  defaultIndex?: number;
  children: React.ReactNode[];
}) {
  const [active, setActive] = useState(Math.min(defaultIndex, labels.length - 1));
  return (
    <div>
      <div className="mb-3 flex gap-1 border-b border-edge" role="tablist">
        {labels.map((label, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
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
