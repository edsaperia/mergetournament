"use client";

import { AutoRefresh, Countdown } from "../live";

/**
 * The pause modal (SPEC §4 Pausing): while the admin has the clock stopped,
 * every participant and observer screen blurs behind this — timers frozen,
 * nothing clickable behind it. It carries its own SSE subscription so
 * unpausing dismisses it live on every page, including ones with no
 * refresher of their own.
 */
export function PauseOverlay({
  slug,
  globalRemainingS,
  roundNo,
  roundRemainingS,
}: {
  slug: string;
  globalRemainingS: number;
  /** The open round frozen mid-flight, if any. */
  roundNo?: number;
  roundRemainingS?: number;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tournament paused"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md"
    >
      <AutoRefresh slug={slug} />
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-edge bg-background p-8 text-center shadow-2xl">
        <span className="text-4xl" aria-hidden>
          ⏸
        </span>
        <p className="text-xl font-bold">Tournament paused by the admin</p>
        {roundNo !== undefined && roundRemainingS !== undefined && (
          <p className="text-sm text-muted">
            Round {roundNo}: <Countdown remainingS={roundRemainingS} paused />
          </p>
        )}
        <p className="text-sm text-muted">
          Total remaining: <Countdown remainingS={globalRemainingS} paused />
        </p>
        <p className="text-xs text-faint">
          Everything is frozen exactly where it stood — editing, lock-ins,
          chat. It all comes back the moment the admin resumes.
        </p>
      </div>
    </div>
  );
}

/**
 * The admin's view of a pause: no blur — the admin must stay able to work
 * the admin page — just a floating reminder with Resume on every page.
 */
export function AdminPauseBar({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber-400 bg-amber-50 py-1.5 pl-4 pr-2 text-sm font-medium text-amber-800 shadow-lg dark:bg-amber-950 dark:text-amber-200">
      <AutoRefresh slug={slug} />
      <span>⏸ Tournament paused</span>
      {children}
    </div>
  );
}
