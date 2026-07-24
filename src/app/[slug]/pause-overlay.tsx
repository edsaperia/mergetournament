"use client";

import { AutoRefresh, Countdown } from "../live";
import { Modal } from "../modal";

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
    <Modal label="Tournament paused" blur className="flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <AutoRefresh slug={slug} />
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
    </Modal>
  );
}

/**
 * The admin's view of a pause: no blur — the admin must stay able to work
 * the admin page — just a floating reminder with Resume on every page.
 */
export function AdminPauseBar({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-warn bg-warn-surface py-1.5 pl-4 pr-2 text-sm font-medium text-warn shadow-lg">
      <AutoRefresh slug={slug} />
      <span>⏸ Tournament paused</span>
      {children}
    </div>
  );
}
