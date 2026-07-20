import "server-only";
import { randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { ConsoleEmailer, Emailer, ResendEmailer } from "../lib/email";
import { signSession, type SessionPayload } from "../lib/auth";

/** Where magic links point. */
export function baseUrl(): string {
  return process.env.BASE_URL ?? "http://localhost:3000";
}

export function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Secret for signing session cookies. In production set AUTH_SECRET; in dev
 * an ephemeral one is generated per process (sessions reset on restart).
 */
const globalCache = globalThis as unknown as { __mtSecret?: string; __mtEmailer?: Emailer };

export function authSecret(): string {
  const configured = process.env.AUTH_SECRET;
  if (configured) return configured;
  if (isProd()) {
    throw new Error("AUTH_SECRET must be set in production");
  }
  globalCache.__mtSecret ??= randomBytes(32).toString("base64url");
  return globalCache.__mtSecret;
}

/** Resend when RESEND_API_KEY is set; otherwise emails print to the console. */
export function getEmailer(): Emailer {
  if (!globalCache.__mtEmailer) {
    const key = process.env.RESEND_API_KEY;
    globalCache.__mtEmailer = key
      ? new ResendEmailer(key, process.env.EMAIL_FROM ?? "Merge Tournament <noreply@mergetournament.org>")
      : new ConsoleEmailer();
  }
  return globalCache.__mtEmailer;
}

export function sessionCookieName(slug: string): string {
  return `mt_s_${slug}`;
}

/**
 * Sign a session and set it on a redirect response — the one place that owns
 * the cookie's security attributes, shared by the participant and sysadmin
 * auth routes.
 */
export function setSessionCookie(res: NextResponse, name: string, payload: SessionPayload, maxAgeS: number): void {
  res.cookies.set(name, signSession(payload, authSecret()), {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeS,
  });
}

/** Instance-operator token; sysadmin features are disabled when unset. */
export function sysadminToken(): string | null {
  return process.env.SYSADMIN_TOKEN || null;
}

/** Webhook signing secret from the Resend dashboard; webhook 503s when unset. */
export function resendWebhookSecret(): string | null {
  return process.env.RESEND_WEBHOOK_SECRET || null;
}

export const SYSADMIN_COOKIE = "mt_sysadmin";
