import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../../db";
import { participantForToken } from "../../../../services/tournament-service";
import { baseUrl, sessionCookieName, setSessionCookie } from "../../../../server/config";

/** The magic link (SPEC §3): visiting sets a session cookie and redirects in. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/[slug]/auth/[token]">) {
  const { slug, token } = await ctx.params;
  const db = await getDb();
  const participant = await participantForToken(db, slug, token);
  if (!participant) {
    return new NextResponse("This link is not valid. Ask the administrator to re-issue it.", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  // Behind the reverse proxy req.url is localhost:3000 — build from BASE_URL.
  const res = NextResponse.redirect(new URL(`/${slug}`, baseUrl()));
  setSessionCookie(
    res,
    sessionCookieName(slug),
    { participantId: participant.id, tournamentId: participant.tournamentId },
    60 * 60 * 24 * 30
  );
  return res;
}
