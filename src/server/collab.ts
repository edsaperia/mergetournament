import "server-only";
import { getDb } from "../db";
import { authSecret } from "./config";
import { createCollabServer, type CollabHandle } from "./collab-core";

/** Port the sync server listens on; the client connects via COLLAB_WS_URL. */
export function collabPort(): number {
  return Number(process.env.COLLAB_PORT ?? 3001);
}

export function collabWsUrl(): string {
  return process.env.COLLAB_WS_URL ?? `ws://localhost:${collabPort()}`;
}

const globalCache = globalThis as unknown as { __mtCollab?: CollabHandle };

export async function startCollab(): Promise<void> {
  if (globalCache.__mtCollab) return;
  const handle = createCollabServer({ port: collabPort(), secret: authSecret(), getDb });
  globalCache.__mtCollab = handle;
  await handle.server.listen();
  console.log(`[collab] sync server listening on :${collabPort()}`);
}

export function collab(): CollabHandle | null {
  return globalCache.__mtCollab ?? null;
}

/**
 * Persist the live CRDT text into the merge row right now (used before
 * propose/confirm and by the backstop, so resolutions never act on a stale
 * snapshot from the debounced store hook).
 */
export async function syncMergeText(mergeId: string): Promise<void> {
  const handle = collab();
  const live = handle?.liveText(mergeId);
  if (live === null || live === undefined) return;
  const db = await getDb();
  const { merges } = await import("../db/schema");
  const { and, eq } = await import("drizzle-orm");
  await db
    .update(merges)
    .set({ workingText: live })
    .where(and(eq(merges.id, mergeId), eq(merges.state, "open")));
}
