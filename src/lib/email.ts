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

/** The magic-link invitation (SPEC §4 Phase 1). */
export function inviteEmail(opts: {
  to: string;
  participantName: string;
  tournamentName: string;
  magicLink: string;
}): Email {
  return {
    to: opts.to,
    subject: `You're invited to ${opts.tournamentName}`,
    text: [
      `Hello ${opts.participantName},`,
      ``,
      `You've been added to "${opts.tournamentName}" on Merge Tournament.`,
      ``,
      `Your personal link (keep it private — it signs you in):`,
      opts.magicLink,
      ``,
      `Use it to write and submit your draft before the deadline.`,
    ].join("\n"),
  };
}

export function magicLink(baseUrl: string, slug: string, token: string): string {
  return `${baseUrl}/${slug}/auth/${token}`;
}
