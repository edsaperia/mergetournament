import { type Tournament } from "../../db/schema";
import { HowItWorks } from "./how-it-works";
import { IntroFold } from "./intro-fold";
import { LocalTime } from "../local-time";

/**
 * The onboarding block: the admin's brief, the built-in explainer, and the
 * schedule as known. Prominent while submissions are open (a first-time
 * participant's landing view); tucked into a collapsible afterwards.
 */
export function IntroSection({ tournament, viewerRole }: { tournament: Tournament; viewerRole: string | null }) {
  const intro = tournament.intro.trim();
  const preStart = tournament.phase === "setup" || tournament.phase === "submission";
  if (!intro && !preStart) return null;
  return (
    <section className="mb-6 flex flex-col gap-3">
      {intro && <IntroFold slug={tournament.slug}>{intro}</IntroFold>}
      {preStart && (
        <>
          <HowItWorks open={viewerRole === "participant"} />
          {(tournament.publishAt || tournament.startAt) && (
            <p className="text-sm text-muted">
              {tournament.publishAt && (
                <>
                  The tournament starts <LocalTime iso={tournament.publishAt.toISOString()} />.
                </>
              )}
              {tournament.startAt && (
                <>
                  {" "}Round 1 opens <LocalTime iso={tournament.startAt.toISOString()} />.
                </>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
