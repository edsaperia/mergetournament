/**
 * Magic-link auth primitives (SPEC §3). Framework-free.
 *
 * - A participant's magic link carries a one-off random token; we store only
 *   its SHA-256 hash. Visiting the link exchanges the token for a session
 *   cookie: an HMAC-signed payload naming the participant.
 * - Uses cryptographic randomness (node:crypto), NOT the seeded tournament
 *   Rng — that one exists for reproducible fairness, never for secrets.
 */

import { createHash, randomBytes } from "node:crypto";
import { signPayload, verifyPayload } from "./signing";

/** Random URL-safe magic-link token (256 bits). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What we store in participants.token_hash. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionPayload {
  participantId: string;
  tournamentId: string;
}

function isSessionPayload(parsed: unknown): parsed is SessionPayload {
  return (
    typeof parsed === "object" && parsed !== null &&
    typeof (parsed as SessionPayload).participantId === "string" &&
    typeof (parsed as SessionPayload).tournamentId === "string"
  );
}

/** Serialize and sign a session for a cookie value. */
export function signSession(payload: SessionPayload, secret: string): string {
  return signPayload(payload, secret, "");
}

/** Verify a cookie value; returns the payload, or null for anything invalid. */
export function verifySession(cookie: string, secret: string): SessionPayload | null {
  return verifyPayload(cookie, secret, "", isSessionPayload);
}
