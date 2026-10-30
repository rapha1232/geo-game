// Applies the SQL migrations in ./drizzle to the database named by DATABASE_URL_UNPOOLED (or DATABASE_URL).
// Runs over Neon's HTTP driver and the batch migrator, so the whole set applies atomically.
// Usage: pnpm --filter @meridian/web db:migrate
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.log("db:migrate skipped: no DATABASE_URL set");
  process.exit(0);
}
const host = new URL(url).host.replace(/^[^.]+\./, "*.");
console.log(`db:migrate applying to ${host}`);
await migrate(drizzle(neon(url)), {
  migrationsFolder: new URL("../drizzle", import.meta.url).pathname,
});
console.log("db:migrate done");
