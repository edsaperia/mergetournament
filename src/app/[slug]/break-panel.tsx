import { type Tournament } from "../../db/schema";
import { workspaceAction } from "../../server/actions";
import { roundMerges, scheduleContext } from "../../server/queries";
import { ControlButton } from "./admin/admin-controls";

/**
 * During a break: the next round starts early only when every bearer in it
 * has confirmed readiness (otherwise it waits for its printed time).
 */
export async function BreakPanel({
  slug,
  tournament,
  participantId,
}: {
  slug: string;
  tournament: Tournament;
  participantId: string | null;
}) {
  const { allRounds } = await scheduleContext(tournament);
  // Only relevant during a break: no round open/closing, a scheduled one next.
  if (allRounds.some((r) => r.state === "open" || r.state === "closing")) return null;
  const next = allRounds.find((r) => r.state === "scheduled");
  if (!next) return null;

  const pending = (await roundMerges(tournament.id, next.number)).filter((m) => m.state === "pending");
  if (pending.length === 0) return null;

  const bearersTotal = pending.length * 2;
  const bearersReady = pending.reduce((n, m) => n + (m.readyA ? 1 : 0) + (m.readyB ? 1 : 0), 0);
  const mine = participantId
    ? pending.find((m) => m.bearerAId === participantId || m.bearerBId === participantId)
    : undefined;
  const iAmReady = mine
    ? mine.bearerAId === participantId
      ? mine.readyA
      : mine.readyB
    : false;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-edge p-4">
      <div>
        <p className="font-semibold">Break — round {next.number} is next</p>
        <p className="text-sm text-muted">
          Scheduled for +{Math.round(next.scheduledStartS / 60)}m; it starts
          sooner only when all its bearers are ready ({bearersReady} of {bearersTotal} so far).
        </p>
      </div>
      {mine && !iAmReady && (
        <ControlButton
          action={workspaceAction.bind(null, slug, mine.id, { type: "readyForRound" as const })}
          label={`I'm ready for round ${next.number}`}
        />
      )}
      {mine && iAmReady && <span className="text-sm font-medium text-green-600">You&apos;re ready ✓</span>}
    </div>
  );
}
