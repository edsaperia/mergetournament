/**
 * The browser tests wipe their database, so every connection they open goes
 * through this guard. Checking the URL alone isn't enough: postgres.js copies
 * unknown query parameters into the startup message, where `?database=victim`
 * overrides the path. So the URL must be plain, its database name must end in
 * "_e2e", and once connected the server must confirm that's the database.
 */

import type { Sql } from "postgres";

/** The database name in an e2e URL, or an error saying why the URL is refused. */
export function e2eDatabaseName(raw: string): string {
  if (/[?#]/.test(raw)) {
    throw new Error("refusing E2E_DATABASE_URL: it must have no query string or fragment");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("refusing E2E_DATABASE_URL: not a valid URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("refusing E2E_DATABASE_URL: it must be a postgres:// URL");
  }
  if (url.hostname.includes(",")) {
    throw new Error("refusing E2E_DATABASE_URL: it must name a single host");
  }
  // Read the name from the URL as written: new URL() resolves "a/../b_e2e" to "b_e2e".
  const [, ...path] = raw.slice(raw.indexOf("://") + 3).split("/");
  const name = path.join("/");
  if (!/^[a-z0-9_]+_e2e$/.test(name) || url.pathname !== `/${name}`) {
    throw new Error(`refusing E2E_DATABASE_URL: the database name must end in "_e2e" (got "${name}")`);
  }
  return name;
}

/** Aborts unless the server says this connection is on the named database. */
export async function assertConnectedTo(sql: Sql, name: string): Promise<void> {
  const [row] = await sql<{ db: string }[]>`select current_database() as db`;
  if (row?.db !== name) {
    throw new Error(`refusing to continue: connected to "${row?.db}", expected "${name}"`);
  }
}
