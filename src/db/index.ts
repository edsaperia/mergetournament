import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Runtime database client. Tests use PGlite instead (see test-db.ts);
 * this module is only imported by server code with DATABASE_URL set.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const client = postgres(url);
export const db = drizzle(client, { schema });
