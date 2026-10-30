import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/** Connection string for runtime queries (the pooled `DATABASE_URL`). */
export function databaseUrl(): string | null {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? null;
}

/** Drizzle client over Neon's HTTP driver, so serverless functions hold no connections. Null when no database is configured. */
export function getDb() {
  const url = databaseUrl();
  return url ? drizzle(neon(url), { schema }) : null;
}

export type Db = NonNullable<ReturnType<typeof getDb>>;
export { schema };
