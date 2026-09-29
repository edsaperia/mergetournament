/**
 * Give the browser tests a fresh database: create it if missing, drop every
 * table, run the migrations. Runs before the app starts (playwright.config.ts).
 * Refuses any database whose name doesn't end in "_e2e", or that the server
 * doesn't confirm it's on, so a mistyped URL can't wipe real data (e2e/db-guard.ts).
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { assertConnectedTo } from "./db-guard";
import { E2E_DATABASE_NAME as name, E2E_DATABASE_URL } from "./env";

async function main() {
  const url = new URL(E2E_DATABASE_URL);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { onnotice: () => {} });
  const [exists] = await admin`select 1 from pg_database where datname = ${name}`;
  if (!exists) await admin.unsafe(`create database ${name}`);
  await admin.end();

  const client = postgres(E2E_DATABASE_URL, { onnotice: () => {} });
  await assertConnectedTo(client, name);
  await client.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  console.log(`[e2e] reset database ${name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
