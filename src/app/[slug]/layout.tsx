import Link from "next/link";
import { currentParticipant, tournamentBySlug } from "../../server/session";
import { SiteLogo } from "../site-logo";

/**
 * Tournament chrome: logo left, tournament name centred (links home for
 * this tournament), admin cog right for the administrator.
 */
export default async function TournamentLayout(props: LayoutProps<"/[slug]">) {
  const { slug } = await props.params;
  const tournament = await tournamentBySlug(slug);
  const me = tournament ? await currentParticipant(slug) : null;

  return (
    <>
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
        {me?.role === "admin" ? (
          <Link
            href={`/${slug}/admin`}
            aria-label="Admin"
            title="Admin"
            className="justify-self-end text-xl text-muted transition-colors hover:text-foreground"
          >
            ⚙
          </Link>
        ) : (
          <span />
        )}
      </header>
      {props.children}
    </>
  );
}
