import { getDb } from "../db";
import { collab, syncMergeText } from "./collab";
import { baseUrl, getEmailer } from "./config";
import { bump } from "./events";
import { tickOnce, type TickerDeps } from "./ticker-core";

/**
 * The scheduler (SPEC §7): a 1s interval that advances every running
 * tournament to where the clock says it should be. Transitions are
 * idempotent, so overlapping or missed ticks are harmless; a page load
 * after a crash re-derives state from the same tick function. The pass
 * itself lives in ticker-core.ts, where its ordering is under test.
 */

const globalCache = globalThis as unknown as {
  __mtTicker?: ReturnType<typeof setInterval>;
  __mtLastTickMs?: number;
};

/** When the scheduler loop last completed, for /healthz. */
export function lastTickMs(): number | null {
  return globalCache.__mtLastTickMs ?? null;
}

function deps(): TickerDeps {
  return {
    getDb,
    emailer: getEmailer(),
    baseUrl: baseUrl(),
    liveMergeIds() {
      const handle = collab();
      if (!handle) return [];
      return [...handle.server.hocuspocus.documents.keys()]
        .filter((name) => name.startsWith("merge:"))
        .map((name) => name.slice("merge:".length));
    },
    syncMergeText,
    bump,
  };
}

export function startTicker(): void {
  if (globalCache.__mtTicker) return;
  let busy = false;
  globalCache.__mtTicker = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await tickOnce(deps(), new Date());
    } catch (e) {
      console.error("[ticker]", e);
    } finally {
      globalCache.__mtLastTickMs = Date.now();
      busy = false;
    }
  }, 1000);
  console.log("[ticker] started");
}
