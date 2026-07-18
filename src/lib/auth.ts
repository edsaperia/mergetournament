/**
 * Magic-link auth primitives (SPEC §3). Framework-free.
 *
 * - A participant's magic link carries a one-off random token; we store only
 *   its SHA-256 hash. Visiting the link exchanges the token for a session
 *   cookie: an HMAC-signed payload naming the participant.
 * - Uses cryptographic randomness (node:crypto), NOT the seeded tournament
 *   Rng — that one exists for reproducible fairness, never for secrets.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Serialize and sign a session for a cookie value. */
export function signSession(payload: SessionPayload, secret: string): string {
  if (!secret) throw new Error("signSession: empty secret");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body, secret)}`;
}

/** Verify a cookie value; returns the payload, or null for anything invalid. */
export function verifySession(cookie: string, secret: string): SessionPayload | null {
  if (!secret) throw new Error("verifySession: empty secret");
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expected = hmac(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" && parsed !== null &&
      typeof (parsed as SessionPayload).participantId === "string" &&
      typeof (parsed as SessionPayload).tournamentId === "string"
    ) {
      const { participantId, tournamentId } = parsed as SessionPayload;
      return { participantId, tournamentId };
    }
    return null;
  } catch {
    return null;
  }
}
