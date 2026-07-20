import Link from "next/link";
import { themeCss, type ThemeOverrides } from "../../lib/theme";
import { currentParticipant, tournamentBySlug } from "../../server/session";
import { SiteLogo } from "../site-logo";
import { ThemeToggle } from "../theme-toggle";

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
          <Link href={`/${slug}`} className="justify-self-center text-lg font-semibold hover:opacity-70">
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
    </>
  );
}
