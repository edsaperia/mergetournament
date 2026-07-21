import { getDb } from "../../../db";
import type { Round, Tournament } from "../../../db/schema";
import { numRounds } from "../../../lib/bracket";
import { totalDurationS } from "../../../lib/schedule";
import { submissionStatus } from "../../../services/tournament-service";
import { beginAction, deleteTournamentAction, pauseAction, publishBracketAction } from "../../../server/actions";
import { latestEmailEvents } from "../../../services/sysadmin-service";
import { roundsFor } from "../../../server/queries";
import { currentParticipant, tournamentBySlug } from "../../../server/session";
import type { ThemeOverrides } from "../../../lib/theme";
import { Tabs } from "../tabs";
import { ControlButton } from "./admin-controls";
import { DeadlineEditor } from "./deadline-editor";
import { Roster } from "./roster";
import { SettingsEditor } from "./settings-editor";
import { TemplateEditor } from "./template-editor";
import { ThemeEditor } from "./theme-editor";

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Where the tournament is in its lifecycle, in words. */
function currentStatus(t: Tournament, allRounds: Round[], submitted: number, roster: number): string {
  switch (t.phase) {
    case "setup":
    case "submission":
      return `Accepting submissions — ${submitted} of ${roster} drafts in`;
    case "convening":
      return "Tournament started — convening for Round 1";
    case "running": {
      if (t.pausedAt) return "Paused";
      const open = allRounds.find((r) => r.state === "open");
      if (open) return `Round ${open.number} of ${allRounds.length} — open`;
      const closing = allRounds.find((r) => r.state === "closing");
      if (closing) return `Round ${closing.number} of ${allRounds.length} — closing (are-you-still-here window)`;
      const next = allRounds.find((r) => r.state === "scheduled");
      if (next) return `Break — Round ${next.number} of ${allRounds.length} up next`;
      return "Wrapping up";
    }
    case "complete":
      return "Complete";
    default:
      return t.phase;
  }
}

/**
 * The admin dashboard: Settings (lifecycle, top to bottom), Template,
 * Roster, Theme. Verifies the viewer itself so it is safe to embed anywhere.
 */
export async function AdminDashboard({ slug }: { slug: string }) {
  const tournament = await tournamentBySlug(slug);
  if (!tournament) return null;
  const me = await currentParticipant(slug);
  if (me?.role !== "admin") {
    return <p className="text-soft">The admin dashboard requires the administrator&apos;s personal link.</p>;
  }

  const db = await getDb();
  const status = await submissionStatus(db, tournament.id);
  const delivery = await latestEmailEvents(db, status.map((s) => s.participant.email));
  const allRounds = await roundsFor(tournament.id);
  const submitted = status.filter((s) => s.draft !== null).length;
  const prePublish = tournament.phase === "setup" || tournament.phase === "submission";

  return (
    <Tabs labels={["Settings", "Template", "Roster", "Theme"]}>
      {/* Settings: read top to bottom, it follows the tournament's life. */}
      <div className="flex flex-col gap-6">
        <p className="rounded-md border border-edge bg-panel px-3 py-2 text-sm">
          <span className="font-semibold">Current status:</span>{" "}
          {currentStatus(tournament, allRounds, submitted, status.length)}
          {submitted >= 2 && prePublish && (
            <span className="text-muted">
              {" "}· at {submitted} drafts: {numRounds(submitted)} rounds, ≤{" "}
              {fmtDuration(
                totalDurationS({
                  numRounds: numRounds(submitted),
                  roundDurationS: tournament.roundDurationS,
                  breakDurationS: tournament.breakDurationS,
                })
              )}
            </span>
          )}
          {submitted < 2 && prePublish && (
            <span className="text-muted"> · needs at least 2 drafts to start</span>
          )}
        </p>

        {tournament.phase === "submission" && (
          <DeadlineEditor slug={slug} deadlineIso={tournament.submissionDeadline?.toISOString() ?? null} />
        )}

        <SettingsEditor
          slug={slug}
          prePublish={prePublish}
          begun={Boolean(tournament.begunAt) || tournament.phase === "running" || tournament.phase === "complete"}
          roundMinutes={Math.round(tournament.roundDurationS / 60)}
          breakMinutes={Math.round(tournament.breakDurationS / 60)}
          startAtIso={tournament.startAt?.toISOString() ?? null}
          visibility={tournament.visibility}
        />

        <div className="border-t border-edge pt-4">
          <div className="flex flex-wrap gap-3">
            {tournament.phase === "submission" && (
              <ControlButton
                action={publishBracketAction.bind(null, slug)}
                label="Start Tournament"
                confirmText={`Start the tournament with ${submitted} drafts? Submissions close, the roster freezes, the bracket is drawn, and everything becomes readable to participants.`}
              />
            )}
            {tournament.phase === "convening" && (
              <ControlButton
                action={beginAction.bind(null, slug)}
                label="Start Round 1"
                confirmText="Has everyone logged in, found their first partner, and sat down next to them? This starts the clock."
              />
            )}
            {tournament.phase === "running" && !tournament.pausedAt && (
              <ControlButton action={pauseAction.bind(null, slug, false)} label="Pause" primary={false} />
            )}
            {tournament.phase === "running" && tournament.pausedAt && (
              <ControlButton action={pauseAction.bind(null, slug, true)} label="Resume" />
            )}
            {(tournament.phase === "convening" || tournament.phase === "running") && (
              <p className="w-full text-sm text-muted">
                There is deliberately no other live control: no extending a round,
                no reassigning a pairing, no overriding a flip.
              </p>
            )}
            {tournament.phase === "submission" && (
              <ControlButton
                action={deleteTournamentAction.bind(null, slug)}
                label="Delete tournament"
                primary={false}
                confirmText="Delete this tournament and all drafts? Only possible before the tournament starts. This cannot be undone."
              />
            )}
          </div>
        </div>
      </div>

      <TemplateEditor slug={slug} prePublish={prePublish} defaultSubmission={tournament.defaultSubmission} />

      <Roster
        slug={slug}
        rows={status.map(({ participant, draft }) => ({
          id: participant.id,
          name: participant.name,
          email: participant.email,
          role: participant.role,
          wordCount: draft?.wordCount ?? null,
          draftId: draft?.id ?? null,
          draftBody: draft?.bodyMd ?? null,
          emailStatus: delivery.get(participant.email)?.event.replace("email.", "") ?? null,
        }))}
      />

      <div>
        <p className="mb-3 text-sm text-muted">
          Colors for this tournament&apos;s pages, in light and dark mode.
        </p>
        <ThemeEditor slug={slug} current={(tournament.theme as ThemeOverrides | null) ?? null} />
      </div>
    </Tabs>
  );
}
