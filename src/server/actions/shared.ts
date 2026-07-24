import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "../../db";
import { ConsoleEmailer } from "../../lib/email";
import { DomainError } from "../../lib/errors";
import type { Db } from "../../services/tournament-service";
import { getEmailer, isProd } from "../config";
import { bump } from "../events";
import { requireAdmin, requireParticipant } from "../session";

export interface ActionState {
  ok: boolean;
  message: string;
  /** Dev-only convenience: with the console emailer, surface the magic link in the UI. */
  devLink?: string;
}

/** DomainError messages are written for users; anything else is logged, never leaked. */
export function fail(e: unknown): ActionState {
  unstable_rethrow(e); // redirect()/notFound() are control flow, not failures
  if (e instanceof DomainError) return { ok: false, message: e.message };
  console.error("[action]", e);
  return { ok: false, message: "something went wrong — please try again" };
}

/** With the console emailer (no email service configured), expose the last link for the UI. */
export function lastDevLink(): string | undefined {
  const emailer = getEmailer();
  if (isProd() || !(emailer instanceof ConsoleEmailer)) return undefined;
  const last = emailer.sent.at(-1);
  return last?.text.match(/https?:\S+\/auth\/\S+/)?.[0];
}

/** Convert a datetime-local value + the client's UTC offset into an instant. */
export function parseLocalDatetime(value: string, tzOffsetMin: number): Date {
  const asUtc = Date.parse(`${value}:00Z`);
  if (Number.isNaN(asUtc)) throw new DomainError("invalid date");
  return new Date(asUtc + tzOffsetMin * 60_000);
}

export type Participant = Awaited<ReturnType<typeof requireParticipant>>;

export interface WrapOptions {
  /** Paths to revalidate on success; a [path, "layout"] entry revalidates the subtree. */
  revalidate?: Array<string | [string, "layout"]>;
  /** Nudge live clients over SSE after the work (default true). */
  notify?: boolean;
}

/**
 * The shared scaffold of every tournament-scoped action: authorize, get the
 * db, do the work, revalidate, bump live clients, and convert thrown rule
 * violations into ActionState — auth failures included, so callers always
 * get a uniform { ok: false } instead of an error boundary.
 */
async function withSession(
  authorize: () => Promise<Participant>,
  opts: WrapOptions,
  fn: (db: Db, me: Participant) => Promise<Partial<ActionState> | void>
): Promise<ActionState> {
  try {
    const me = await authorize();
    const db = await getDb();
    const out = (await fn(db, me)) ?? {};
    for (const path of opts.revalidate ?? []) {
      if (Array.isArray(path)) revalidatePath(path[0], path[1]);
      else revalidatePath(path);
    }
    if (opts.notify !== false) bump(me.tournamentId);
    return { ok: true, message: "", ...out };
  } catch (e) {
    return fail(e);
  }
}

export const withParticipant = (
  slug: string,
  opts: WrapOptions,
  fn: (db: Db, me: Participant) => Promise<Partial<ActionState> | void>
) => withSession(() => requireParticipant(slug), opts, fn);

export const withAdmin = (
  slug: string,
  opts: WrapOptions,
  fn: (db: Db, admin: Participant) => Promise<Partial<ActionState> | void>
) => withSession(() => requireAdmin(slug), opts, fn);
