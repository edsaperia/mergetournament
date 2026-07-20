/**
 * The collaborative-editing sync server (SPEC §7): Hocuspocus with
 * server-enforced write gates. Framework-free — the db and secret are
 * injected — so the gates are integration-testable over real WebSockets.
 *
 * Gate rules (client-side read-only states are UX; this is the guarantee):
 * - Only the merge's bearers may write, and only while the merge is open,
 *   un-proposed, the round open, the tournament running and not paused.
 * - Everyone else (participants, admin, observers) connects read-only.
 * - Late or tampered updates against a frozen merge are rejected outright.
 */

import { Server } from "@hocuspocus/server";
import { and, eq } from "drizzle-orm";
import { merges, rounds, slots, tournaments } from "../db/schema";
import { verifyCollabToken } from "../lib/collab-token";
import type { Db } from "../services/tournament-service";

export interface CollabContext {
  participantId: string;
  mergeId: string;
  side: "A" | "B" | null;
}

export interface CollabConfig {
  port: number;
  secret: string;
  getDb: () => Promise<Db>;
  /** onStoreDocument debounce in ms. */
  debounce?: number;
}

export function docName(mergeId: string): string {
  return `merge:${mergeId}`;
}

function mergeIdOf(documentName: string): string {
  if (!documentName.startsWith("merge:")) throw new Error(`unexpected document: ${documentName}`);
  return documentName.slice("merge:".length);
}

interface Gate {
  writable: boolean;
  bearerAId: string | null;
  bearerBId: string | null;
}

export function createCollabServer(config: CollabConfig) {
  const gateCache = new Map<string, { at: number; gate: Gate }>();
  const activityMarked = new Set<string>();

  async function loadGate(mergeId: string, maxAgeMs = 500): Promise<Gate> {
    const cached = gateCache.get(mergeId);
    if (cached && Date.now() - cached.at < maxAgeMs) return cached.gate;
    const db = await config.getDb();
    // One round-trip on the hot write path: merge -> slot -> tournament -> round.
    const [row] = await db
      .select({
        mergeState: merges.state,
        proposedBy: merges.proposedBy,
        bearerAId: merges.bearerAId,
        bearerBId: merges.bearerBId,
        roundState: rounds.state,
        phase: tournaments.phase,
        pausedAt: tournaments.pausedAt,
      })
      .from(merges)
      .innerJoin(slots, eq(slots.id, merges.slotId))
      .innerJoin(tournaments, eq(tournaments.id, slots.tournamentId))
      .leftJoin(rounds, and(eq(rounds.tournamentId, slots.tournamentId), eq(rounds.number, slots.roundNo)))
      .where(eq(merges.id, mergeId));
    if (!row) throw new Error("merge not found");
    const gate: Gate = {
      writable:
        row.mergeState === "open" &&
        row.proposedBy === null &&
        row.roundState === "open" &&
        row.phase === "running" &&
        row.pausedAt === null,
      bearerAId: row.bearerAId,
      bearerBId: row.bearerBId,
    };
    gateCache.set(mergeId, { at: Date.now(), gate });
    return gate;
  }

  const server = new Server<CollabContext>({
    port: config.port,
    quiet: true,
    debounce: config.debounce ?? 500,
    unloadImmediately: true,

    async onAuthenticate({ token, documentName, connectionConfig }) {
      const claim = verifyCollabToken(token, config.secret);
      if (!claim) throw new Error("invalid token");
      if (documentName !== docName(claim.mergeId)) throw new Error("token does not match document");
      const gate = await loadGate(claim.mergeId, 0);
      const side: CollabContext["side"] =
        gate.bearerAId === claim.participantId ? "A" : gate.bearerBId === claim.participantId ? "B" : null;
      if (side === null || !gate.writable) connectionConfig.readOnly = true;
      return { participantId: claim.participantId, mergeId: claim.mergeId, side } satisfies CollabContext;
    },

    async beforeHandleMessage({ connection, context }) {
      if (connection.readOnly) return; // hocuspocus already drops its writes
      const gate = await loadGate(context.mergeId);
      if (!gate.writable) throw new Error("merge is frozen (locked, proposed, or paused)");
    },

    async onLoadDocument({ document, documentName }) {
      const db = await config.getDb();
      const [m] = await db.select().from(merges).where(eq(merges.id, mergeIdOf(documentName)));
      const text = document.getText("content");
      if (m && text.length === 0 && m.workingText.length > 0) {
        text.insert(0, m.workingText);
      }
    },

    async onChange({ context, documentName }) {
      // Mark the writing bearer active for the backstop (SPEC §4).
      if (!context?.side) return;
      const key = `${documentName}:${context.side}`;
      if (activityMarked.has(key)) return;
      activityMarked.add(key);
      const db = await config.getDb();
      await db
        .update(merges)
        .set(context.side === "A" ? { activeA: true } : { activeB: true })
        .where(eq(merges.id, mergeIdOf(documentName)));
    },

    async onStoreDocument({ document, documentName }) {
      const db = await config.getDb();
      const content = document.getText("content").toString();
      // Never clobber a merge that has moved past open editing.
      await db
        .update(merges)
        .set({ workingText: content })
        .where(and(eq(merges.id, mergeIdOf(documentName)), eq(merges.state, "open")));
    },

    async afterUnloadDocument({ documentName }) {
      // Long-lived process: drop per-document state once the doc unloads,
      // or these maps grow with every merge ever edited.
      gateCache.delete(mergeIdOf(documentName));
      activityMarked.delete(`${documentName}:A`);
      activityMarked.delete(`${documentName}:B`);
    },
  });

  return {
    server,
    /** Live document text, if the doc is loaded in memory. */
    liveText(mergeId: string): string | null {
      const doc = server.hocuspocus.documents.get(docName(mergeId));
      return doc ? doc.getText("content").toString() : null;
    },
    /** Drop the gate cache for a merge so freezes apply immediately. */
    invalidateGate(mergeId: string): void {
      gateCache.delete(mergeId);
    },
  };
}

export type CollabHandle = ReturnType<typeof createCollabServer>;
