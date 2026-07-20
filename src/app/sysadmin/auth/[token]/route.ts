import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { baseUrl, SYSADMIN_COOKIE, setSessionCookie, sysadminToken } from "../../../../server/config";

/** Exchange the SYSADMIN_TOKEN for an operator session cookie. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/sysadmin/auth/[token]">) {
  const { token } = await ctx.params;
  const expected = sysadminToken();
  if (!expected) return new Response("sysadmin is not configured on this instance", { status: 503 });
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("invalid token", { status: 401 });
  }
  // Behind the reverse proxy req.url is localhost:3000 — build from BASE_URL.
  const res = NextResponse.redirect(new URL("/sysadmin", baseUrl()));
  setSessionCookie(res, SYSADMIN_COOKIE, { participantId: "sysadmin", tournamentId: "*" }, 60 * 60 * 24 * 7);
  return res;
}
