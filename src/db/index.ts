import "server-only";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";
import type { Db } from "../services/tournament-service";

/**
 * Runtime database. With DATABASE_URL set, connects to real Postgres.
 * Without it (local dev), falls back to embedded Postgres (PGlite)
 * persisted under .data/ — zero setup, same SQL, same migrations.
 *
 * Cached on globalThis so Next.js dev-mode hot reloads reuse one instance.
 */

const globalCache = globalThis as unknown as { __mtDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    return drizzlePostgres(postgres(url), { schema }) as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(".data", { recursive: true });
  const client = new PGlite(".data/pglite");
  const db = drizzlePglite(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[db] DATABASE_URL not set - using embedded PGlite at .data/pglite");
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  globalCache.__mtDb ??= connect();
  return globalCache.__mtDb;
}
