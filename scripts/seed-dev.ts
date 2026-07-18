/**
 * Dev seeding: creates a demo tournament with an admin and three
 * participants in the local PGlite database and prints their magic links.
 * Run BEFORE starting the dev server (PGlite is single-process):
 *
 *   npx tsx scripts/seed-dev.ts
 */

import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import { ConsoleEmailer } from "../src/lib/email";
import { addParticipant, createTournament, Db } from "../src/services/tournament-service";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  mkdirSync(".data", { recursive: true });
  const client = new PGlite(".data/pglite");
  const pglite = drizzle(client, { schema });
  await migrate(pglite, { migrationsFolder: "./drizzle" });
  const db = pglite as unknown as Db;

  const emailer = new ConsoleEmailer();
  const t = await createTournament(db, {
    slug: "demo",
    name: "Demo Convention",
    roundDurationS: 30 * 60,
    breakDurationS: 10 * 60,
    defaultSubmission: "# Draft Constitution\n\nWe, the undersigned…\n",
  });
  await addParticipant(db, emailer, BASE, t.id, { name: "Admin", email: "admin@example.org", role: "admin" });
  for (const [name, email] of [
    ["Ada", "ada@example.org"],
    ["Bo", "bo@example.org"],
    ["Cy", "cy@example.org"],
  ]) {
    await addParticipant(db, emailer, BASE, t.id, { name, email });
  }
  await client.close();
  console.log("\nSeeded /demo. Magic links above (one per invite email).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
