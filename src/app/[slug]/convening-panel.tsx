import { readyAction } from "../../server/actions";
import { rosterFor } from "../../server/queries";
import { ControlButton } from "./admin/admin-controls";

/** The convening lobby: readiness roll-call; Round 1 opens when all are ready (SPEC §4). */
export async function ConveningPanel({
  slug,
  tournamentId,
  me,
}: {
  slug: string;
  tournamentId: string;
  me: { id: string; role: string; ready: boolean } | null;
}) {
  const roster = (await rosterFor(tournamentId)).filter((p) => p.role === "participant");
  const readyCount = roster.filter((p) => p.ready).length;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-edge p-4">
      <div>
        <p className="font-semibold">Convening</p>
        <p className="text-sm text-muted">
          Read the drafts, find your first partner, sit next to them.{" "}
          {readyCount} of {roster.length} ready — Round 1 opens when everyone
          is (or when the admin starts it).
        </p>
      </div>
      {me && me.role === "participant" && !me.ready && (
        <ControlButton action={readyAction.bind(null, slug)} label="I'm ready" />
      )}
      {me && me.role === "participant" && me.ready && (
        <span className="text-sm font-medium text-green-600">You&apos;re ready ✓</span>
      )}
    </div>
  );
}
