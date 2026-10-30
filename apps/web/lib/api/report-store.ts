import { and, eq, gte, isNotNull, ne } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import type { ReportStore } from "./reports";

/** The Neon-backed store, or null when no database is configured. */
export function drizzleReportStore(): ReportStore | null {
  const db = getDb();
  if (!db) return null;
  const t = schema.reports;
  return {
    async insert(row) {
      const out = await db
        .insert(t)
        .values({
          category: row.category,
          message: row.message,
          targetRef: row.targetRef,
          context: row.context,
          contentVersion: row.contentVersion,
          reporterEmail: row.reporterEmail,
        })
        .returning({ id: t.id, status: t.status });
      return out[0] as { id: string; status: string };
    },
    async listForDedupe(sinceMs) {
      const rows = await db
        .select({
          id: t.id,
          createdAt: t.createdAt,
          targetRef: t.targetRef,
          category: t.category,
          message: t.message,
        })
        .from(t)
        .where(
          and(
            gte(t.createdAt, new Date(sinceMs)),
            ne(t.status, "duplicate"),
            isNotNull(t.targetRef),
          ),
        );
      return rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.getTime(),
        targetRef: r.targetRef as string,
        category: r.category,
        message: r.message,
      }));
    },
    async markDuplicate(id, of) {
      await db.update(t).set({ status: "duplicate", duplicateOf: of }).where(eq(t.id, id));
    },
  };
}
