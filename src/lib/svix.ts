/**
 * Verification for Svix-style webhook signatures (Resend uses Svix).
 * Scheme: secret is `whsec_<base64>`; the signed content is
 * `${id}.${timestamp}.${payload}` HMAC-SHA256'd with the decoded secret;
 * the `svix-signature` header holds space-separated `v1,<base64sig>` entries.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySvixSignature(opts: {
  secret: string;
  id: string;
  timestamp: string;
  payload: string;
  signatureHeader: string;
  /** Reject signatures older than this many seconds (default 300). */
  toleranceS?: number;
  nowMs?: number;
}): boolean {
  const { secret, id, timestamp, payload, signatureHeader } = opts;
  const tolerance = opts.toleranceS ?? 300;
  const now = opts.nowMs ?? Date.now();

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > tolerance) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();

  for (const part of signatureHeader.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const candidate = Buffer.from(sig, "base64");
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return true;
  }
  return false;
}
