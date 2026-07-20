import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { tournaments } from "../db/schema";
import { tick } from "../services/runtime-service";
import { baseUrl, getEmailer } from "./config";

/**
 * The scheduler (SPEC §7): a 1s interval that advances every running
 * tournament to where the clock says it should be. Transitions are
 * idempotent, so overlapping or missed ticks are harmless; a page load
 * after a crash re-derives state from the same tick function.
 */

const globalCache = globalThis as unknown as { __mtTicker?: ReturnType<typeof setInterval> };

export function startTicker(): void {
  if (globalCache.__mtTicker) return;
  let busy = false;
  globalCache.__mtTicker = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const db = await getDb();
      // Flush live CRDT texts so backstop resolutions never act on stale rows.
      const { collab, syncMergeText } = await import("./collab");
      const handle = collab();
      if (handle) {
        for (const name of handle.server.hocuspocus.documents.keys()) {
          if (name.startsWith("merge:")) await syncMergeText(name.slice("merge:".length));
        }
      }
      const running = await db.select().from(tournaments).where(eq(tournaments.phase, "running"));
      for (const t of running) {
        try {
          await tick(db, getEmailer(), baseUrl(), t.id, new Date());
        } catch (e) {
          console.error(`[ticker] tournament ${t.slug}:`, e);
        }
      }
    } catch (e) {
      console.error("[ticker]", e);
    } finally {
      busy = false;
    }
  }, 1000);
  console.log("[ticker] started");
}
