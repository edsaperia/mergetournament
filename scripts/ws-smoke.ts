/**
 * Connects to the running collab server as a read-only observer and reports
 * sync status. Usage:
 *   AUTH_SECRET=... npx tsx scripts/ws-smoke.ts <mergeId> [participantId]
 */

import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { signCollabToken } from "../src/lib/collab-token";

const [mergeId, participantId = "observer"] = process.argv.slice(2);
const secret = process.env.AUTH_SECRET;
if (!mergeId || !secret) {
  console.error("need mergeId arg and AUTH_SECRET env");
  process.exit(2);
}

const document = new Y.Doc();
const provider = new HocuspocusProvider({
  url: process.env.COLLAB_WS_URL ?? "ws://localhost:3001",
  name: `merge:${mergeId}`,
  token: signCollabToken({ participantId, mergeId }, secret),
  document,
  onAuthenticationFailed: (m) => {
    console.error("AUTH FAILED", m);
    process.exit(1);
  },
});

const deadline = Date.now() + 10000;
const poll = setInterval(() => {
  if (provider.synced) {
    console.log(`SYNCED as ${participantId}; doc length=${document.getText("content").length}`);
    clearInterval(poll);
    provider.destroy();
    process.exit(0);
  }
  if (Date.now() > deadline) {
    console.error("TIMEOUT waiting for sync");
    process.exit(1);
  }
}, 100);
