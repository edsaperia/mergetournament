/**
 * Test tournaments, built the way the app builds them: through the service
 * layer (the same makeTournament the vitest suites use), against the e2e
 * database the running app reads. Emails are captured, not sent, so each
 * participant's magic link comes straight from their invitation.
 */

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { expect, type Page } from "@playwright/test";
import * as schema from "../src/db/schema";
import { merges, slots } from "../src/db/schema";
import { ConsoleEmailer, type Email } from "../src/lib/email";
import { makeTournament } from "../src/services/test-fixture";
import type { Db } from "../src/services/tournament-service";
import { assertConnectedTo } from "./db-guard";
import { BASE_URL, E2E_DATABASE_NAME, E2E_DATABASE_URL } from "./env";

/** The console emailer, minus the console: invitations are kept in `sent` for the test to read. */
class QuietEmailer extends ConsoleEmailer {
  async send(email: Email): Promise<void> {
    this.sent.push(email);
  }
}

export async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = postgres(E2E_DATABASE_URL, { onnotice: () => {} });
  try {
    await assertConnectedTo(client, E2E_DATABASE_NAME);
    return await fn(drizzle(client, { schema }) as unknown as Db);
  } finally {
    await client.end();
  }
}

export interface Bearer {
  name: string;
  /** Their magic link, as emailed. */
  link: string;
}

/**
 * A tournament with the given participants and their drafts. With
 * `roundDurationS`, it is published and begun now, and the first round-1
 * merge is returned with its two bearers.
 */
export async function setUpTournament(opts: { names: string[]; roundDurationS?: number }) {
  const slug = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const emailer = new QuietEmailer();
  return withDb(async (db) => {
    const fx = await makeTournament(db, {
      slug,
      name: "E2E Tournament",
      names: opts.names,
      participants: opts.names.length,
      roundDurationS: opts.roundDurationS ?? 600,
      breakDurationS: 30,
      emailer,
      baseUrl: BASE_URL,
      beginAt: opts.roundDurationS ? new Date() : undefined,
    });
    const linkFor = (email: string): string => {
      const invite = emailer.sent.find((e) => e.to === email);
      const link = invite?.text.split("\n").find((line) => line.startsWith(`${BASE_URL}/${slug}/auth/`));
      if (!link) throw new Error(`no magic link emailed to ${email}`);
      return link;
    };
    const bearer = (id: string | null): Bearer => {
      const p = fx.people.find((q) => q.id === id);
      if (!p) throw new Error(`no participant ${id}`);
      return { name: p.name, link: linkFor(p.email) };
    };

    let merge: { id: string; url: string; a: Bearer; b: Bearer } | null = null;
    if (opts.roundDurationS) {
      const round1 = await db
        .select({ id: slots.id })
        .from(slots)
        .where(and(eq(slots.tournamentId, fx.t.id), eq(slots.roundNo, 1)));
      const [m] = await db
        .select()
        .from(merges)
        .where(inArray(merges.slotId, round1.map((s) => s.id)));
      merge = { id: m.id, url: `/${slug}/merge/${m.id}`, a: bearer(m.bearerAId), b: bearer(m.bearerBId) };
    }
    return { slug, people: fx.people.map((p) => ({ name: p.name, link: linkFor(p.email) })), merge };
  });
}

/** The merge candidate's text as the editor holds it, without the partner's presence cursor. */
export async function editorText(page: Page): Promise<string> {
  return page.locator(".cm-content").evaluate((content) => {
    const copy = content.cloneNode(true) as HTMLElement;
    copy.querySelectorAll(".cm-ySelectionCaret, .cm-ySelectionInfo, .cm-widgetBuffer").forEach((el) => el.remove());
    return [...copy.querySelectorAll(".cm-line")].map((line) => (line.textContent ?? "").replace(/⁠/g, "")).join("\n");
  });
}

/** Open the merge workspace and wait until the collaborative editor is connected. */
export async function openWorkspace(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByText("live", { exact: true })).toBeVisible();
}

/** Type at the end of the merge candidate, on a new line if it isn't empty. */
export async function typeAtEnd(page: Page, text: string): Promise<void> {
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  if ((await editorText(page)) !== "") await page.keyboard.press("Enter");
  await page.keyboard.type(text);
}
