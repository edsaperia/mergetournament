import Link from "next/link";
import type { Tournament } from "../../db/schema";
import { themeCss, type ThemeOverrides } from "../../lib/theme";
import { pauseAction } from "../../server/actions";
import { scheduleContext } from "../../server/queries";
import { currentParticipant, tournamentBySlug } from "../../server/session";
import { SiteLogo } from "../site-logo";
import { ThemeToggle } from "../theme-toggle";
import { ControlButton } from "./admin/admin-controls";
import { PauseOverlay } from "./pause-overlay";

/**
 * Tournament chrome: logo left, tournament name centred (links home for
 * this tournament), admin cog right for the administrator.
 */
export default async function TournamentLayout(props: LayoutProps<"/[slug]">) {
  const { slug } = await props.params;
  const tournament = await tournamentBySlug(slug);
  const me = tournament ? await currentParticipant(slug) : null;

  // Per-tournament colors: themeCss re-validates, so only strict hex ever
  // reaches this style tag.
  const theme = tournament?.theme ? themeCss(tournament.theme as ThemeOverrides) : "";

  return (
    <>
      {theme && <style dangerouslySetInnerHTML={{ __html: theme }} />}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pt-3">
        <div className="justify-self-start">
          <SiteLogo />
        </div>
        {tournament ? (
          <Link
            href={`/${slug}`}
            className="max-w-[55vw] truncate justify-self-center text-base font-semibold hover:opacity-70 sm:text-lg"
          >
            {tournament.name}
          </Link>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3 justify-self-end">
          <ThemeToggle />
          {me?.role === "admin" && (
            <Link
              href={`/${slug}/admin`}
              aria-label="Admin"
              title="Admin"
              className="text-xl text-muted transition-colors hover:text-foreground"
            >
              ⚙
            </Link>
          )}
        </div>
      </header>
      {props.children}
      {tournament && <PauseGate tournament={tournament} isAdmin={me?.role === "admin"} />}
    </>
  );
}

/**
 * SPEC §4 Pausing: while paused, every screen in the tournament blurs behind
 * the modal — rendered from the layout so text pages, admin, everything is
 * covered. The admin alone gets Resume inside it (the timeline's pause
 * controls are behind the blur like everything else).
 */
async function PauseGate({
  tournament,
  isAdmin,
}: {
  tournament: Tournament;
  isAdmin: boolean;
}) {
  if (tournament.phase !== "running" || !tournament.pausedAt) return null;
  const ctx = await scheduleContext(tournament);
  const open = ctx.allRounds.find((r) => r.state === "open" || r.state === "closing");
  return (
    <PauseOverlay
      slug={tournament.slug}
      globalRemainingS={ctx.globalRemaining()}
      roundNo={open?.number}
      roundRemainingS={
        open ? (open.state === "closing" ? ctx.backstopRemaining(open) : ctx.remainingFor(open.number)) : undefined
      }
    >
      {isAdmin && <ControlButton action={pauseAction.bind(null, tournament.slug, true)} label="Resume" />}
    </PauseOverlay>
  );
}
