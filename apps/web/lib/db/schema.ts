import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { REPORT_CATEGORIES, REPORT_SEVERITIES, REPORT_STATUSES } from "@meridian/schemas";

/** Case-insensitive text (needs the `citext` extension, created in the first migration). */
const citext = customType<{ data: string }>({ dataType: () => "citext" });

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(", ")})`);

/** Challenge short codes (DATA_MODEL §3.3). `code` is stored normalized, without dashes. */
export const challenges = pgTable(
  "challenges",
  {
    code: text("code").primaryKey(),
    gameId: text("game_id").notNull(),
    payload: text("payload").notNull(),
    /** SHA-256 of the payload, so an identical payload returns the existing code (API_CONTRACTS §4.2). */
    payloadHash: text("payload_hash").notNull(),
    contentVersion: text("content_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    uses: integer("uses").notNull().default(0),
    /** References `users` once accounts exist (R2). */
    creatorUserId: uuid("creator_user_id"),
  },
  (t) => [
    check("challenges_payload_len", sql`length(${t.payload}) <= 2048`),
    uniqueIndex("challenges_payload_hash_key").on(t.payloadHash),
    index("challenges_last_used_at_idx").on(t.lastUsedAt),
  ],
);

/** Player reports (DATA_MODEL §3.3). */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("new"),
    severity: text("severity"),
    category: text("category").notNull(),
    message: text("message").notNull(),
    context: jsonb("context")
      .notNull()
      .default(sql`'{}'::jsonb`),
    targetRef: text("target_ref"),
    contentVersion: text("content_version").notNull(),
    reporterEmail: citext("reporter_email"),
    /** References `users` once accounts exist (R2). */
    userId: uuid("user_id"),
    duplicateOf: uuid("duplicate_of"),
    assignedTo: uuid("assigned_to"),
    resolutionNote: text("resolution_note"),
    resolvedInVersion: text("resolved_in_version"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    check("reports_status_check", inList(t.status.name, REPORT_STATUSES)),
    check(
      "reports_severity_check",
      sql`${t.severity} IS NULL OR ${inList(t.severity.name, REPORT_SEVERITIES)}`,
    ),
    check("reports_category_check", inList(t.category.name, REPORT_CATEGORIES)),
    check("reports_message_len", sql`length(${t.message}) BETWEEN 10 AND 1000`),
    index("reports_status_created_idx").on(t.status, t.createdAt),
    index("reports_target_ref_idx").on(t.targetRef),
  ],
);

/** One row per published content release. */
export const contentReleases = pgTable("content_releases", {
  version: text("version").primaryKey(),
  releasedAt: timestamp("released_at", { withTimezone: true }).notNull(),
  manifestSha256: text("manifest_sha256").notNull(),
  notes: text("notes").notNull().default(""),
});
