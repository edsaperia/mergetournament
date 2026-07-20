/**
 * Commit-reveal for tournament randomness (fairness beyond trust): a master
 * secret is generated at publish and its hash posted publicly; every random
 * draw afterwards derives deterministically from the secret; the secret is
 * revealed at completion so anyone can verify every flip from the audit log.
 */

import { createHash, randomBytes } from "node:crypto";

export function makeMasterSecret(): string {
  return randomBytes(32).toString("hex");
}

/** The public commitment posted at publish. */
export function commitmentOf(masterSecret: string): string {
  return createHash("sha256").update(masterSecret).digest("hex");
}

/**
 * Deterministic 32-bit seed for one draw. Purposes in use:
 * "placement" (bracket seeding), "flip:<mergeId>", "round:<n>" (idle-matching).
 */
export function deriveSeed(masterSecret: string, purpose: string): number {
  return createHash("sha256").update(`${masterSecret}:${purpose}`).digest().readUInt32BE(0);
}
