import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { tournaments } from "../db/schema";
import { tick } from "../services/runtime-service";
import { collab, syncMergeText } from "./collab";
import { baseUrl, getEmailer } from "./config";
import { bump } from "./events";

/**
 * The scheduler (SPEC §7): a 1s interval that advances every running
 * tournament to where the clock says it should be. Transitions are
 * idempotent, so overlapping or missed ticks are harmless; a page load
 * after a crash re-derives state from the same tick function.
 */

const globalCache = globalThis as unknown as {
  __mtTicker?: ReturnType<typeof setInterval>;
  __mtLastTickMs?: number;
};

/** When the scheduler loop last completed, for /healthz. */
export function lastTickMs(): number | null {
  return globalCache.__mtLastTickMs ?? null;
}

export function startTicker(): void {
  if (globalCache.__mtTicker) return;
  let busy = false;
  globalCache.__mtTicker = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const db = await getDb();
      // Flush live CRDT texts so backstop resolutions never act on stale rows.
      const handle = collab();
      if (handle) {
        for (const name of handle.server.hocuspocus.documents.keys()) {
          if (name.startsWith("merge:")) await syncMergeText(name.slice("merge:".length));
        }
      }
      // Auto-begin: a convening tournament whose start datetime has arrived.
      const convening = await db.select().from(tournaments).where(eq(tournaments.phase, "convening"));
      for (const t of convening) {
        if (t.startAt && t.startAt.getTime() <= Date.now()) {
          try {
            const { beginTournament } = await import("../services/runtime-service");
            await beginTournament(db, t.id, new Date());
            bump(t.id);
          } catch (e) {
            console.error(`[ticker] auto-begin ${t.slug}:`, e);
          }
        }
      }

      const running = await db.select().from(tournaments).where(eq(tournaments.phase, "running"));
      for (const t of running) {
        try {
          const changed = await tick(db, getEmailer(), baseUrl(), t.id, new Date());
          if (changed) bump(t.id);
        } catch (e) {
          console.error(`[ticker] tournament ${t.slug}:`, e);
        }
      }
    } catch (e) {
      console.error("[ticker]", e);
    } finally {
      globalCache.__mtLastTickMs = Date.now();
      busy = false;
    }
  }, 1000);
  console.log("[ticker] started");
}
