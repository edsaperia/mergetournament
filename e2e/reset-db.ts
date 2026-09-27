/**
 * Give the browser tests a fresh database: create it if missing, drop every
 * table, run the migrations. Runs before the app starts (playwright.config.ts).
 * Refuses any database whose name doesn't end in "_e2e", so a mistyped URL
 * can't wipe real data.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { E2E_DATABASE_URL } from "./env";

async function main() {
  const url = new URL(E2E_DATABASE_URL);
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+_e2e$/.test(name)) {
    throw new Error(`refusing to reset "${name}": the e2e database name must end in "_e2e"`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { onnotice: () => {} });
  const [exists] = await admin`select 1 from pg_database where datname = ${name}`;
  if (!exists) await admin.unsafe(`create database ${name}`);
  await admin.end();

  const client = postgres(E2E_DATABASE_URL, { onnotice: () => {} });
  await client.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  console.log(`[e2e] reset database ${name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
