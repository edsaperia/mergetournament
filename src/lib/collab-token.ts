/**
 * Tokens for the collaborative-editor sync server (SPEC §7): every
 * connection authenticates with a role-scoped token naming the participant
 * and the merge document. Same HMAC scheme as session cookies.
 */

import { signPayload, verifyPayload } from "./signing";

export interface CollabClaim {
  /** Participant id, or "observer" for anonymous read-only access. */
  participantId: string;
  mergeId: string;
}

function isCollabClaim(parsed: unknown): parsed is CollabClaim {
  return (
    typeof parsed === "object" && parsed !== null &&
    typeof (parsed as CollabClaim).participantId === "string" &&
    typeof (parsed as CollabClaim).mergeId === "string"
  );
}

export function signCollabToken(claim: CollabClaim, secret: string): string {
  return signPayload(claim, secret, "collab");
}

export function verifyCollabToken(token: string, secret: string): CollabClaim | null {
  return verifyPayload(token, secret, "collab", isCollabClaim);
}
