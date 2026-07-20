/**
 * The one HMAC token scheme: base64url(JSON payload) + "." +
 * HMAC-SHA256(secret, domain-prefixed payload). Session cookies and collab
 * tokens are both built on this; the timing-safe compare and parsing live
 * here once, callers supply a shape guard for their payload type.
 *
 * `domain` separates token kinds signed with the same secret (a collab
 * token can never pass as a session). Sessions predate the separation and
 * use the empty domain — changing that would invalidate every live cookie.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

function hmac(domain: string, data: string, secret: string): string {
  const input = domain ? `${domain}:${data}` : data;
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function signPayload(payload: unknown, secret: string, domain: string): string {
  if (!secret) throw new Error(`signPayload(${domain || "session"}): empty secret`);
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(domain, body, secret)}`;
}

export function verifyPayload<T>(
  token: string,
  secret: string,
  domain: string,
  isValid: (parsed: unknown) => parsed is T
): T | null {
  if (!secret) throw new Error(`verifyPayload(${domain || "session"}): empty secret`);
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(hmac(domain, body, secret));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
