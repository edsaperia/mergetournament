import { getDb } from "../../../db";
import { submissionStatus } from "../../../services/tournament-service";
import { deleteTournamentAction } from "../../../server/actions";
import { latestEmailEvents } from "../../../services/sysadmin-service";
import { roundsFor } from "../../../server/queries";
import { currentParticipant, tournamentBySlug } from "../../../server/session";
import type { ThemeOverrides } from "../../../lib/theme";
import { Tabs } from "../tabs";
import { ControlButton } from "./admin-controls";
import { IntroEditor } from "./intro-editor";
import { Roster } from "./roster";
import { TemplateEditor } from "./template-editor";
import { ThemeEditor } from "./theme-editor";
import { Timeline } from "./timeline";
import { VisibilityEditor } from "./visibility-editor";

/**
 * The admin dashboard: the Settings tab leads with the timeline — every
 * stage of the tournament in order with its times and controls — plus
 * Template, Roster, and Theme tabs. Verifies the viewer itself so it is
 * safe to embed anywhere.
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
  const invited = status.filter((s) => s.participant.role === "participant").length;

  return (
    <Tabs
      labels={["Timeline", "Intro", "Template", "Roster", "Theme", "Settings"]}
      ids={["timeline", "intro", "template", "roster", "theme", "settings"]}
    >
      <Timeline
        slug={slug}
        tournament={tournament}
        allRounds={allRounds}
        submitted={submitted}
        invited={invited}
      />

      <IntroEditor slug={slug} intro={tournament.intro} adminName={me.name} tournamentName={tournament.name} />

      <TemplateEditor
        slug={slug}
        prePublish={tournament.phase === "setup" || tournament.phase === "submission"}
        defaultSubmission={tournament.defaultSubmission}
      />

      <Roster
        slug={slug}
        introDone={tournament.intro.trim() !== ""}
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

      <div className="flex flex-col gap-6">
        <VisibilityEditor slug={slug} visibility={tournament.visibility} />
        {(tournament.phase === "setup" || tournament.phase === "submission") && (
          <div>
            <ControlButton
              action={deleteTournamentAction.bind(null, slug)}
              label="Delete tournament"
              primary={false}
              confirmText="Delete this tournament and all drafts? Only possible before the tournament starts. This cannot be undone."
            />
          </div>
        )}
      </div>
    </Tabs>
  );
}
