import type { NextRequest } from "next/server";
import { subscribe } from "../../../server/events";
import { currentParticipant, tournamentBySlug } from "../../../server/session";

/**
 * Live updates (SPEC §7): a server-sent-event stream per tournament.
 * Events carry no payload — just "changed" — clients re-fetch server data.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/[slug]/events">) {
  const { slug } = await ctx.params;
  const tournament = await tournamentBySlug(slug);
  if (!tournament) return new Response("not found", { status: 404 });
  if (tournament.visibility === "participants_only" && !(await currentParticipant(slug))) {
    return new Response("unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = subscribe(tournament.id, () => send("changed"));
      const heartbeat = setInterval(() => send("ping"), 15000);
      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", cleanup);
      send("hello");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
