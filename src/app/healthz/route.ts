import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { collab } from "../../server/collab";
import { lastTickMs } from "../../server/ticker";

/**
 * Operator health check. 200 when the database answers, the scheduler has
 * ticked recently, and the collab sync server is up; 503 otherwise. Point
 * any uptime pinger here — a silently dead scheduler mid-event is the
 * failure mode this exists to catch.
 */
export async function GET() {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    checks.database = "ok";
  } catch (e) {
    checks.database = `error: ${e instanceof Error ? e.message : "unknown"}`;
    healthy = false;
  }

  const tick = lastTickMs();
  const tickAgeS = tick === null ? null : (Date.now() - tick) / 1000;
  if (tickAgeS !== null && tickAgeS < 15) {
    checks.scheduler = `ok (ticked ${tickAgeS.toFixed(1)}s ago)`;
  } else {
    checks.scheduler = tick === null ? "never ticked" : `stale (${tickAgeS!.toFixed(0)}s ago)`;
    healthy = false;
  }

  checks.collab = collab() ? "ok" : "not running";
  if (!collab()) healthy = false;

  return Response.json({ healthy, checks }, { status: healthy ? 200 : 503 });
}
