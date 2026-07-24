import { type Tournament } from "../../db/schema";
import { warnThresholds } from "../../lib/schedule";
import { roundMerges, scheduleContext } from "../../server/queries";
import { NotificationBell } from "./notification-bell";

/** Server-side snapshot feeding the notification bell's transition detection. */
export async function BellWithState({
  tournament,
  participantId,
}: {
  tournament: Tournament;
  participantId: string;
}) {
  const { warnAtS } = warnThresholds(tournament.roundDurationS);
  let myOpenMergeId: string | null = null;
  let roundNo: number | null = null;
  let remainingS: number | null = null;

  if (tournament.phase === "running" && tournament.begunAt && !tournament.pausedAt) {
    const ctx = await scheduleContext(tournament);
    const open = ctx.allRounds.find((r) => r.state === "open");
    if (open) {
      roundNo = open.number;
      remainingS = ctx.remainingFor(open.number);
      const mine = (await roundMerges(tournament.id, open.number)).find(
        (m) => m.state === "open" && (m.bearerAId === participantId || m.bearerBId === participantId)
      );
      myOpenMergeId = mine?.id ?? null;
    }
  }
  return (
    <NotificationBell
      myOpenMergeId={myOpenMergeId}
      roundNo={roundNo}
      remainingS={remainingS}
      warnAtS={warnAtS}
      phase={tournament.phase}
    />
  );
}
