"use client";

import { AutoRefresh, Countdown } from "../live";

/**
 * The pause modal (SPEC §4 Pausing): while the admin has the clock stopped,
 * every screen blurs behind this — timers frozen, nothing clickable behind
 * it. It carries its own SSE subscription so unpausing dismisses it live on
 * every page, including ones with no refresher of their own. The admin gets
 * the Resume control right here (passed in as children).
 */
export function PauseOverlay({
  slug,
  globalRemainingS,
  roundNo,
  roundRemainingS,
  children,
}: {
  slug: string;
  globalRemainingS: number;
  /** The open round frozen mid-flight, if any. */
  roundNo?: number;
  roundRemainingS?: number;
  children?: React.ReactNode;
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
        {children}
      </div>
    </div>
  );
}
