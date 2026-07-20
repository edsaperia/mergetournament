"use client";

import { useState } from "react";

/**
 * The merge workspace's three tabs (SPEC §4): Input A, Input B, Merge
 * candidate. Inactive tabs stay mounted (hidden) so the collaborative
 * editor keeps its connection and chats keep their state.
 */
export function WorkspaceTabs({
  labels,
  defaultIndex = 2,
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
