import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { REPORT_CATEGORIES, REPORT_SEVERITIES, REPORT_STATUSES } from "@meridian/schemas";
import { challenges, contentReleases, reports } from "../lib/db/schema";

const migration = readFileSync(resolve(process.cwd(), "drizzle/0000_init.sql"), "utf8");
const cols = (t: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(t).columns.map((c) => c.name);

describe("database schema (DATA_MODEL §3.3)", () => {
  it("challenges has the specified columns, a payload length check and the dedupe index", () => {
    expect(cols(challenges)).toEqual([
      "code",
      "game_id",
      "payload",
      "payload_hash",
      "content_version",
      "created_at",
      "last_used_at",
      "uses",
      "creator_user_id",
    ]);
    expect(getTableConfig(challenges).checks.map((c) => c.name)).toContain(
      "challenges_payload_len",
    );
    expect(migration).toContain('length("challenges"."payload") <= 2048');
    expect(migration).toContain('CREATE UNIQUE INDEX "challenges_payload_hash_key"');
  });

  it("reports has the specified columns and indexes", () => {
    expect(cols(reports)).toEqual([
      "id",
      "created_at",
      "status",
      "severity",
      "category",
      "message",
      "context",
      "target_ref",
      "content_version",
      "reporter_email",
      "user_id",
      "duplicate_of",
      "assigned_to",
      "resolution_note",
      "resolved_in_version",
      "resolved_at",
    ]);
    expect(migration).toContain(
      '"reports_status_created_idx" ON "reports" USING btree ("status","created_at")',
    );
    expect(migration).toContain('"reports_target_ref_idx"');
  });

  it("the CHECK lists in SQL equal the zod enums (one source of truth)", () => {
    for (const v of [...REPORT_STATUSES, ...REPORT_SEVERITIES, ...REPORT_CATEGORIES])
      expect(migration).toContain(`'${v}'`);
    const category = /category IN \(([^)]*)\)/
      .exec(migration)?.[1]
      ?.split(", ")
      .map((s) => s.replaceAll("'", ""));
    expect(category).toEqual([...REPORT_CATEGORIES]);
    const status = /status IN \(([^)]*)\)/
      .exec(migration)?.[1]
      ?.split(", ")
      .map((s) => s.replaceAll("'", ""));
    expect(status).toEqual([...REPORT_STATUSES]);
    expect(migration).toContain('length("reports"."message") BETWEEN 10 AND 1000');
  });

  it("creates citext before using it, and has content_releases", () => {
    expect(migration.indexOf("CREATE EXTENSION IF NOT EXISTS citext")).toBeLessThan(
      migration.indexOf('"citext"'),
    );
    expect(cols(contentReleases)).toEqual(["version", "released_at", "manifest_sha256", "notes"]);
  });

  it("every migration is journaled", () => {
    const journal = JSON.parse(
      readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8"),
    ) as { entries: { tag: string }[] };
    const files = readdirSync(resolve(process.cwd(), "drizzle"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(".sql", ""));
    expect(journal.entries.map((e) => e.tag).sort()).toEqual(files.sort());
  });
});
