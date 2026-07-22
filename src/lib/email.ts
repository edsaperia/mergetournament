/**
 * Email abstraction (SPEC §11: Resend in production, plain-text-friendly).
 * Dev/test use the console emailer, so the whole flow runs with no API key;
 * the Resend implementation arrives with deployment.
 */

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export interface Emailer {
  send(email: Email): Promise<void>;
}

export class ConsoleEmailer implements Emailer {
  public sent: Email[] = [];
  async send(email: Email): Promise<void> {
    this.sent.push(email);
    console.log(`[email] to=${email.to} subject=${JSON.stringify(email.subject)}\n${email.text}`);
  }
}

/**
 * Production emailer via the Resend HTTP API (SPEC §11). Failures are
 * logged, never thrown: an email outage must not break a running
 * tournament's transitions — the audit log and UI carry the same facts.
 */
export class ResendEmailer implements Emailer {
  constructor(
    private apiKey: string,
    private from: string
  ) {}

  async send(email: Email): Promise<void> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, text: email.text }),
      });
      if (!res.ok) {
        console.error(`[email] resend ${res.status} for ${email.to}: ${await res.text()}`);
      }
    } catch (e) {
      console.error(`[email] resend failed for ${email.to}:`, e);
    }
  }
}

/** Format an instant in the event's local time (tzOffsetMin = minutes behind UTC). */
export function fmtEventLocal(date: Date, tzOffsetMin: number): string {
  const shifted = new Date(date.getTime() - tzOffsetMin * 60_000);
  const day = shifted.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${day}, ${hh}:${mm}`;
}

/**
 * One human sentence (or two) of logistics, derived from whatever the admin
 * has scheduled so far. Times are event-local (see fmtEventLocal) — an email
 * cannot know its reader's timezone, the tournament page can.
 */
export function scheduleLine(t: {
  submissionDeadline: Date | null;
  publishAt: Date | null;
  startAt: Date | null;
  roundDurationS: number;
  breakDurationS: number;
  tzOffsetMin: number;
}): string {
  const parts: string[] = [];
  if (t.submissionDeadline) parts.push(`Drafts are due ${fmtEventLocal(t.submissionDeadline, t.tzOffsetMin)}.`);
  if (t.startAt) parts.push(`Round 1 starts ${fmtEventLocal(t.startAt, t.tzOffsetMin)}.`);
  else if (t.publishAt) parts.push(`The tournament starts ${fmtEventLocal(t.publishAt, t.tzOffsetMin)}.`);
  if (parts.length === 0) {
    parts.push("Timing is still being decided — the tournament page always shows the latest schedule.");
  }
  parts.push(
    `Rounds are ${Math.round(t.roundDurationS / 60)} minutes with ${Math.round(t.breakDurationS / 60)}-minute breaks; ` +
      `how many rounds depends on how many drafts come in.`
  );
  return parts.join(" ");
}

/** The magic-link invitation (SPEC §4 Phase 1). */
export function inviteEmail(opts: {
  to: string;
  participantName: string;
  tournamentName: string;
  /** Who invited them; omitted for the admin's own (self) invite. */
  adminName?: string;
  /** The admin's participant brief; may be empty. */
  intro?: string;
  /** Derived logistics sentence(s); may be empty. */
  schedule?: string;
  magicLink: string;
  baseUrl?: string;
}): Email {
  const lines = [
    `Hello ${opts.participantName},`,
    ``,
    opts.adminName
      ? `${opts.adminName} has invited you to "${opts.tournamentName}" on Merge Tournament.`
      : `You're the administrator of "${opts.tournamentName}" on Merge Tournament.`,
  ];
  if (opts.intro?.trim()) lines.push(``, opts.intro.trim());
  if (opts.schedule) lines.push(``, opts.schedule);
  lines.push(
    ``,
    `Your personal link (keep it private — it signs you in):`,
    opts.magicLink,
    ``,
    `Use it to read the details and write your draft.`
  );
  if (opts.baseUrl) {
    lines.push(
      ``,
      `New to merge tournaments? Everyone writes a draft, then drafts are merged pairwise under a clock until one text remains — ${opts.baseUrl} explains how.`
    );
  }
  return {
    to: opts.to,
    subject: `You're invited to ${opts.tournamentName}`,
    text: lines.join("\n"),
  };
}

export function magicLink(baseUrl: string, slug: string, token: string): string {
  return `${baseUrl}/${slug}/auth/${token}`;
}

/**
 * Operator heads-up when a tournament is created (sent when SYSADMIN_EMAIL
 * is set). Links the dashboard PAGE, never the operator auth token — the
 * page is inert without the operator's cookie, so nothing here is secret.
 */
export function tournamentCreatedEmail(opts: {
  to: string;
  tournamentName: string;
  tournamentUrl: string;
  creatorName: string;
  creatorEmail: string;
  sysadminUrl: string;
}): Email {
  return {
    to: opts.to,
    subject: `New tournament: ${opts.tournamentName}`,
    text: [
      `A tournament was just created on this instance.`,
      ``,
      `${opts.tournamentName}`,
      opts.tournamentUrl,
      ``,
      `Created by ${opts.creatorName} <${opts.creatorEmail}>.`,
      ``,
      `Operator dashboard: ${opts.sysadminUrl}`,
      `(Needs your operator session — if it has expired, sign in with your`,
      `operator link. That link is deliberately never included in email.)`,
    ].join("\n"),
  };
}
