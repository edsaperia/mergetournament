import "server-only";
import { randomBytes } from "node:crypto";
import { ConsoleEmailer, Emailer } from "../lib/email";

/** Where magic links point. */
export function baseUrl(): string {
  return process.env.BASE_URL ?? "http://localhost:3000";
}

/**
 * Secret for signing session cookies. In production set AUTH_SECRET; in dev
 * an ephemeral one is generated per process (sessions reset on restart).
 */
const globalCache = globalThis as unknown as { __mtSecret?: string; __mtEmailer?: Emailer };

export function authSecret(): string {
  const configured = process.env.AUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production");
  }
  globalCache.__mtSecret ??= randomBytes(32).toString("base64url");
  return globalCache.__mtSecret;
}

/** Console emailer until a RESEND_API_KEY-backed one lands with deployment. */
export function getEmailer(): Emailer {
  globalCache.__mtEmailer ??= new ConsoleEmailer();
  return globalCache.__mtEmailer;
}

export function sessionCookieName(slug: string): string {
  return `mt_s_${slug}`;
}
