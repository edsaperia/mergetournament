/**
 * Dev seeding for the runtime: creates a tournament with five submitted
 * drafts, publishes the bracket, and BEGINS it with short rounds, so the
 * server boots into a live tournament (the ticker takes it from there).
 * Run before starting the dev server:  npx tsx scripts/seed-live.ts
 */

import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import { ConsoleEmailer } from "../src/lib/email";
import { beginTournament, publishBracket } from "../src/services/runtime-service";
import { addParticipant, createTournament, saveDraft, Db } from "../src/services/tournament-service";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  mkdirSync(".data", { recursive: true });
  const client = new PGlite(".data/pglite");
  const pglite = drizzle(client, { schema });
  await migrate(pglite, { migrationsFolder: "./drizzle" });
  const db = pglite as unknown as Db;

  const emailer = new ConsoleEmailer();
  const slug = `live-${Date.now().toString(36)}`;
  const t = await createTournament(db, {
    slug,
    name: "Live Demo",
    roundDurationS: 60,
    breakDurationS: 10,
  });
  await addParticipant(db, emailer, BASE, t.id, { name: "Admin", email: "admin@live.org", role: "admin" });
  for (let i = 0; i < 5; i++) {
    const p = await addParticipant(db, emailer, BASE, t.id, { name: `P${i}`, email: `p${i}@live.org` });
    await saveDraft(db, p.id, `# Draft ${i}\n\nArticle 1 of P${i}'s constitution.`);
  }
  const { n, numRounds } = await publishBracket(db, emailer, BASE, t.id);
  await beginTournament(db, t.id, new Date());
  await client.close();
  console.log(`\nLive tournament running at ${BASE}/${slug} (${n} drafts, ${numRounds} rounds, 60s rounds / 10s breaks).`);
  console.log(`slug=${slug}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
