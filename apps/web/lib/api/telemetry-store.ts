import { and, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import type { EventRow, Stat, StatKey, TelemetryStore } from "./telemetry";

/** The Neon-backed store, or null when no database is configured. */
export function drizzleTelemetryStore(): TelemetryStore | null {
  const db = getDb();
  if (!db) return null;
  const e = schema.answerEvents;
  const c = schema.calibrationStats;
  return {
    async insertMany(rows) {
      await db.insert(e).values(
        rows.map((r) => ({
          occurredAt: new Date(r.occurredAt),
          sessionHash: r.sessionHash,
          gameId: r.gameId,
          itemKind: r.itemKind,
          itemId: r.itemId,
          promptId: r.promptId,
          answerEntityId: r.answerEntityId,
          correct: r.correct,
          attempt: r.attempt,
          difficultySetting: r.difficultySetting,
          contentVersion: r.contentVersion,
        })),
      );
    },
    async takePending(limit) {
      // One statement marks and returns the rows, so two instances never take the same event.
      const out = await db
        .update(e)
        .set({ aggregatedAt: new Date() })
        .where(
          inArray(
            e.id,
            db
              .select({ id: e.id })
              .from(e)
              .where(isNull(e.aggregatedAt))
              .orderBy(e.id)
              .limit(limit),
          ),
        )
        .returning();
      return out.map((r): EventRow => ({
        occurredAt: r.occurredAt.getTime(),
        sessionHash: r.sessionHash,
        gameId: r.gameId,
        itemKind: r.itemKind,
        itemId: r.itemId,
        promptId: r.promptId,
        answerEntityId: r.answerEntityId,
        correct: r.correct,
        attempt: r.attempt,
        difficultySetting: r.difficultySetting,
        contentVersion: r.contentVersion,
      }));
    },
    async getStats(keys: readonly StatKey[]) {
      if (keys.length === 0) return [];
      const rows = await db
        .select()
        .from(c)
        .where(
          or(
            ...keys.map((k) =>
              and(
                sql`${c.itemKind} = ${k.itemKind}`,
                sql`${c.itemId} = ${k.itemId}`,
                sql`${c.promptId} = ${k.promptId}`,
              ),
            ),
          ),
        );
      return rows.map((r): Stat => ({
        itemKind: r.itemKind,
        itemId: r.itemId,
        promptId: r.promptId,
        n: r.n,
        correctFirst: r.correctFirst,
        pickCounts: r.pickCounts as Record<string, number>,
      }));
    },
    async putStats(stats) {
      if (stats.length === 0) return;
      await db
        .insert(c)
        .values(
          stats.map((s) => ({
            itemKind: s.itemKind,
            itemId: s.itemId,
            promptId: s.promptId,
            n: s.n,
            correctFirst: s.correctFirst,
            pickCounts: s.pickCounts,
            updatedAt: new Date(),
          })),
        )
        .onConflictDoUpdate({
          target: [c.itemKind, c.itemId, c.promptId],
          set: {
            n: sql`excluded.n`,
            correctFirst: sql`excluded.correct_first`,
            pickCounts: sql`excluded.pick_counts`,
            updatedAt: sql`now()`,
          },
        });
    },
    async deleteBefore(cutoffMs) {
      const gone = await db
        .delete(e)
        .where(lt(e.occurredAt, new Date(cutoffMs)))
        .returning({ id: e.id });
      return gone.length;
    },
  };
}
