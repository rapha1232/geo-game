import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import type { ChallengeStore } from "./challenges";

/** The Neon-backed store, or null when no database is configured. */
export function drizzleChallengeStore(): ChallengeStore | null {
  const db = getDb();
  if (!db) return null;
  const t = schema.challenges;
  return {
    async findByHash(hash) {
      const rows = await db
        .select({ code: t.code })
        .from(t)
        .where(eq(t.payloadHash, hash))
        .limit(1);
      return rows[0] ?? null;
    },
    async insert(row) {
      const out = await db
        .insert(t)
        .values({
          code: row.code,
          gameId: row.gameId,
          payload: row.payload,
          payloadHash: row.payloadHash,
          contentVersion: row.contentVersion,
        })
        .onConflictDoNothing()
        .returning({ code: t.code });
      return out.length > 0;
    },
    async use(code) {
      const rows = await db
        .update(t)
        .set({ uses: sql`${t.uses} + 1`, lastUsedAt: sql`now()` })
        .where(eq(t.code, code))
        .returning({
          code: t.code,
          gameId: t.gameId,
          payload: t.payload,
          contentVersion: t.contentVersion,
        });
      return rows[0] ?? null;
    },
  };
}
