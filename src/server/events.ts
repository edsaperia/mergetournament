import { EventEmitter } from "node:events";

/**
 * In-process event bus for live updates (SPEC §7): anything that changes a
 * tournament's visible state bumps it; SSE subscribers tell clients to
 * refresh. Single-server by design (SPEC §10).
 */

const globalCache = globalThis as unknown as { __mtEvents?: EventEmitter };

function bus(): EventEmitter {
  if (!globalCache.__mtEvents) {
    globalCache.__mtEvents = new EventEmitter();
    globalCache.__mtEvents.setMaxListeners(500); // one listener per open browser tab
  }
  return globalCache.__mtEvents;
}

export function bump(tournamentId: string): void {
  bus().emit(tournamentId);
}

export function subscribe(tournamentId: string, listener: () => void): () => void {
  bus().on(tournamentId, listener);
  return () => bus().off(tournamentId, listener);
}
