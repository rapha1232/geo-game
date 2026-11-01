import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  primaryKey,
  smallint,
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

/** Anonymous answer events (DATA_MODEL §3.3). Never linked to a user; raw rows are deleted after 90 days. */
export const answerEvents = pgTable(
  "answer_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** Random per play session; identifies nobody. */
    sessionHash: text("session_hash").notNull(),
    gameId: text("game_id").notNull(),
    itemKind: text("item_kind").notNull(),
    itemId: text("item_id").notNull(),
    promptId: text("prompt_id"),
    answerEntityId: text("answer_entity_id"),
    correct: boolean("correct").notNull(),
    attempt: smallint("attempt").notNull(),
    difficultySetting: text("difficulty_setting").notNull(),
    contentVersion: text("content_version").notNull(),
    /** Set when the event was rolled into `calibration_stats`. */
    aggregatedAt: timestamp("aggregated_at", { withTimezone: true }),
  },
  (t) => [
    index("answer_events_occurred_idx").on(t.occurredAt),
    index("answer_events_pending_idx")
      .on(t.id)
      .where(sql`${t.aggregatedAt} IS NULL`),
  ],
);

/** Per-item calibration counts rolled up from `answer_events` (DATA_MODEL §3.3). */
export const calibrationStats = pgTable(
  "calibration_stats",
  {
    itemKind: text("item_kind").notNull(),
    itemId: text("item_id").notNull(),
    promptId: text("prompt_id").notNull().default(""),
    n: integer("n").notNull().default(0),
    correctFirst: integer("correct_first").notNull().default(0),
    pickCounts: jsonb("pick_counts")
      .notNull()
      .default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.itemKind, t.itemId, t.promptId] })],
);
