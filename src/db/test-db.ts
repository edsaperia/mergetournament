/**
 * Test database: embedded Postgres via PGlite, with the real generated
 * migrations applied — the same SQL production runs.
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, client };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];
