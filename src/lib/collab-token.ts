/**
 * Tokens for the collaborative-editor sync server (SPEC §7): every
 * connection authenticates with a role-scoped token naming the participant
 * and the merge document. Same HMAC scheme as session cookies.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface CollabClaim {
  /** Participant id, or "observer" for anonymous read-only access. */
  participantId: string;
  mergeId: string;
}

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(`collab:${data}`).digest("base64url");
}

export function signCollabToken(claim: CollabClaim, secret: string): string {
  if (!secret) throw new Error("signCollabToken: empty secret");
  const body = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${body}.${hmac(body, secret)}`;
}

export function verifyCollabToken(token: string, secret: string): CollabClaim | null {
  if (!secret) throw new Error("verifyCollabToken: empty secret");
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(hmac(body, secret));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" && parsed !== null &&
      typeof (parsed as CollabClaim).participantId === "string" &&
      typeof (parsed as CollabClaim).mergeId === "string"
    ) {
      const { participantId, mergeId } = parsed as CollabClaim;
      return { participantId, mergeId };
    }
    return null;
  } catch {
    return null;
  }
}
