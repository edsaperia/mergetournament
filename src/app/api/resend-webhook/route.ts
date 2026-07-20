import type { NextRequest } from "next/server";
import { getDb } from "../../../db";
import { emailEvents } from "../../../db/schema";
import { verifySvixSignature } from "../../../lib/svix";
import { resendWebhookSecret } from "../../../server/config";

/**
 * Resend delivery webhooks (Svix-signed). Records events per email address
 * so the admin roster can show delivered/bounced at check-in.
 */
export async function POST(req: NextRequest) {
  const secret = resendWebhookSecret();
  if (!secret) return new Response("webhook secret not configured", { status: 503 });

  const payload = await req.text();
  const ok = verifySvixSignature({
    secret,
    id: req.headers.get("svix-id") ?? "",
    timestamp: req.headers.get("svix-timestamp") ?? "",
    signatureHeader: req.headers.get("svix-signature") ?? "",
    payload,
  });
  if (!ok) return new Response("bad signature", { status: 401 });

  let parsed: { type?: string; data?: { to?: string[] } };
  try {
    parsed = JSON.parse(payload);
  } catch {
    return new Response("bad payload", { status: 400 });
  }
  const type = parsed.type;
  const recipients = parsed.data?.to ?? [];
  if (!type || recipients.length === 0) return new Response("ignored", { status: 202 });

  const db = await getDb();
  for (const to of recipients) {
    await db.insert(emailEvents).values({ email: to.toLowerCase().trim(), event: type });
  }
  return new Response("ok", { status: 200 });
}
