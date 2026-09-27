/**
 * Where the browser tests run the app: its own ports (so a dev server on
 * :3000/:3001 can stay up) and its own Postgres database, which is wiped
 * before every run. Override the database with E2E_DATABASE_URL — never
 * DATABASE_URL, which may point at real data.
 */

import { e2eDatabaseName } from "./db-guard";

export const PORT = 3100;
export const COLLAB_PORT = 3101;
export const BASE_URL = `http://localhost:${PORT}`;
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/mergetournament_e2e";
/** Checked on load, so a refused URL stops the run before anything connects (e2e/db-guard.ts). */
export const E2E_DATABASE_NAME = e2eDatabaseName(E2E_DATABASE_URL);
