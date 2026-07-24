import { eq } from "drizzle-orm";
import type { Participant, TextVersion, Tournament } from "../db/schema";
import { tournaments } from "../db/schema";
import { ConsoleEmailer, type Emailer } from "../lib/email";
import { beginTournament, publishBracket } from "./runtime-service";
import { addParticipant, createTournament, saveDraft, type Db } from "./tournament-service";

export interface TournamentFixture {
  t: Tournament;
  admin: Participant;
  people: Participant[];
  /** Drafts in participant order; participants whose draftBody returned null are skipped. */
  drafts: TextVersion[];
  emailer: Emailer;
}

/**
 * The opening move of almost every DB-backed suite: a tournament with an
 * admin and N drafted participants, optionally published and begun.
 * Participant i is named names[i] (default "Pi") with email
 * "<name lowercased>@<slug>.org"; the admin is "admin@<slug>.org".
 */
export async function makeTournament(
  db: Db,
  opts: {
    slug: string;
    /** Tournament display name; defaults to the slug. */
    name?: string;
    /** How many participants to invite (default 2). */
    participants?: number;
    /** Display names, participant i taking names[i]; default P0, P1, … */
    names?: string[];
    roundDurationS?: number;
    breakDurationS?: number;
    emailer?: Emailer;
    baseUrl?: string;
    /** Participant i's draft; return null to leave them draftless. Default: "Draft {i} from {name}." */
    draftBody?: (i: number, name: string) => string | null;
    /** Publish the bracket once drafts are in. */
    publish?: boolean;
    /** Begin the tournament (opens Round 1) at this instant; implies publish. */
    beginAt?: Date;
  }
): Promise<TournamentFixture> {
  const {
    slug,
    name = slug,
    participants: n = 2,
    names = [],
    roundDurationS = 600,
    breakDurationS = 60,
    emailer = new ConsoleEmailer(),
    baseUrl = "http://x",
    draftBody = (i, who) => `Draft ${i} from ${who}.`,
    publish = false,
    beginAt,
  } = opts;

  let t = await createTournament(db, { slug, name, roundDurationS, breakDurationS });
  const admin = await addParticipant(db, emailer, baseUrl, t.id, {
    name: "Admin",
    email: `admin@${slug}.org`,
    role: "admin",
  });
  const people: Participant[] = [];
  const drafts: TextVersion[] = [];
  for (let i = 0; i < n; i++) {
    const who = names[i] ?? `P${i}`;
    const p = await addParticipant(db, emailer, baseUrl, t.id, {
      name: who,
      email: `${who.toLowerCase()}@${slug}.org`,
    });
    people.push(p);
    const body = draftBody(i, who);
    if (body !== null) drafts.push(await saveDraft(db, p.id, body));
  }
  if (publish || beginAt) await publishBracket(db, emailer, baseUrl, t.id);
  if (beginAt) {
    await beginTournament(db, t.id, beginAt);
    [t] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
  }
  return { t, admin, people, drafts, emailer };
}
