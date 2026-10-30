import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ambiguityGroup, dailySchedule, dispute, type DailySchedule } from "@meridian/schemas";
import { buildPacks } from "../src/build.ts";
import { addDays, extendSchedule, targetFor, type DailyCandidate } from "../src/daily.ts";
import { adjacencyOverrides, silhouetteOverrides } from "../src/derive.ts";
import { parseEditorial } from "../src/editorial.ts";
import { contentSetFromBuild, errorsOf, validate } from "../src/validate/index.ts";
import { fixtureInput, repoPath } from "./helpers.ts";

const continents = ["AF", "AS", "EU", "NA", "OC", "SA"];
const pool: DailyCandidate[] = Array.from({ length: 197 }, (_, i) => ({
  id: `country:${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + (Math.floor(i / 26) % 26))}${String.fromCharCode(65 + Math.floor(i / 676))}`,
  continent: `continent:${continents[(i * 5) % 6]}`,
  areaKm2: i % 9 === 0 ? 1000 + i : 60_000 + i * 900,
  shape: ((i * 37) % 100) / 100,
}));

describe("extendSchedule", () => {
  const s = extendSchedule({ pool, from: "2026-11-01", to: "2028-10-30", seed: "TEST-SEED" });
  const dates = Object.keys(s.days).sort();
  const cand = new Map(pool.map((c) => [c.id, c]));

  it("fills every day of 730 and is a valid schedule", () => {
    expect(dates).toHaveLength(730);
    expect(dailySchedule.safeParse(s).success).toBe(true);
  });
  it("is deterministic for a seed and differs between seeds", () => {
    expect(
      extendSchedule({ pool, from: "2026-11-01", to: "2028-10-30", seed: "TEST-SEED" }),
    ).toEqual(s);
    expect(
      extendSchedule({ pool, from: "2026-11-01", to: "2026-12-31", seed: "OTHER" }).days,
    ).not.toEqual(Object.fromEntries(dates.slice(0, 61).map((d) => [d, s.days[d]])));
  });
  it("no target repeats within 150 days", () => {
    const last = new Map<string, string>();
    for (const d of dates) {
      const id = s.days[d]![0]!;
      if (last.has(id))
        expect(
          Math.round((Date.parse(d) - Date.parse(last.get(id)!)) / 864e5),
        ).toBeGreaterThanOrEqual(150);
      last.set(id, d);
    }
  });
  it("never two days in a row on the same continent, and at most one small entity per 7 days", () => {
    const at = (i: number) => cand.get(s.days[dates[i]!]![0]!)!;
    for (let i = 1; i < dates.length; i++) expect(at(i).continent).not.toBe(at(i - 1).continent);
    for (let i = 0; i + 6 < dates.length; i++)
      expect(
        [0, 1, 2, 3, 4, 5, 6].filter((k) => at(i + k).areaKm2 < 5000).length,
      ).toBeLessThanOrEqual(1);
  });
  it("every 7-day window's mean difficulty stays within 0.1 of the pool mean", () => {
    const mean = pool.reduce((a, c) => a + c.shape, 0) / pool.length;
    for (let i = 0; i + 6 < dates.length; i++) {
      const w = dates.slice(i, i + 7).map((d) => cand.get(s.days[d]![0]!)!.shape);
      expect(Math.abs(w.reduce((a, b) => a + b, 0) / 7 - mean)).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  });
  it("extending continues from the last day, keeping the old days", () => {
    const more = extendSchedule({
      pool,
      existing: s,
      from: s.from,
      to: addDays(s.to, 30),
      seed: "TEST-SEED",
    });
    expect(Object.keys(more.days)).toHaveLength(760);
    expect(more.days[dates[100]!]).toEqual(s.days[dates[100]!]);
    expect(targetFor(more, addDays(s.to, 5))).toBeDefined();
    expect(targetFor(more, addDays(s.to, 31))).toBeUndefined();
  });
});

const haveRaw = existsSync(repoPath("data/raw/ne/ne_10m_admin_0_countries.geojson"));
describe.skipIf(!haveRaw)("the committed Silhouette daily schedule", () => {
  const yaml = (f: string): Record<string, unknown> =>
    parse(readFileSync(repoPath(f), "utf8"), { schema: "core" }) as Record<string, unknown>;
  const read = (f: string) => JSON.parse(readFileSync(repoPath(f), "utf8"));
  const schedule = dailySchedule.parse(read("content/daily/silhouette.json"));
  const input = fixtureInput({
    members: (
      yaml("content/sets/sovereign-197.yaml") as { members: { code: string; un: boolean }[] }
    ).members,
    ne: {
      "110m": read("data/raw/ne/ne_110m_admin_0_countries.geojson"),
      "50m": read("data/raw/ne/ne_50m_admin_0_countries.geojson"),
      "10m": read("data/raw/ne/ne_10m_admin_0_countries.geojson"),
    },
    wikidata: read("data/snapshots/wikidata-countries.json"),
    editorial: parseEditorial(yaml("content/countries.yaml")),
    ambiguity: (yaml("content/ambiguity.yaml").groups as unknown[]).map((g) =>
      ambiguityGroup.parse(g),
    ),
    disputes: (yaml("content/disputes.yaml").disputes as unknown[]).map((d) => dispute.parse(d)),
    derive: {
      silhouettes: silhouetteOverrides.parse(yaml("content/overrides/silhouettes.yaml")).overrides,
      adjacency: adjacencyOverrides.parse(yaml("content/overrides/adjacency.yaml")),
    },
    daily: [schedule],
  });
  const out = buildPacks(input);
  const set = (daily?: DailySchedule[]) =>
    contentSetFromBuild(input, out, { fullSets: true, ...(daily ? { daily } : {}) });

  it("AC-SH-015: covers 730 days and the validator finds no repeat within 150 days", () => {
    expect(Object.keys(schedule.days)).toHaveLength(730);
    expect(errorsOf(validate(set())).filter((i) => i.code === "DAILY_REPEAT")).toEqual([]);
    expect(out.files.some((f) => f.name === "daily.silhouette")).toBe(true);
  }, 180_000);

  it("AC-SH-014: every client reads the same target for a date", () => {
    expect(targetFor(schedule, "2026-11-05")).toBe(
      targetFor(dailySchedule.parse(read("content/daily/silhouette.json")), "2026-11-05"),
    );
    expect(targetFor(schedule, "2026-11-05")).toMatch(/^country:[A-Z]{3}$/);
  });

  it("the validator rejects a repeat within 150 days, a same-continent pair, two small entities in a week", () => {
    const days = { ...schedule.days };
    const dates = Object.keys(days).sort();
    const repeated = { ...schedule, days: { ...days, [dates[10]!]: days[dates[0]!]! } };
    expect(errorsOf(validate(set([repeated]))).some((i) => i.code === "DAILY_REPEAT")).toBe(true);
    const sameContinent = {
      ...schedule,
      days: { ...days, [dates[21]!]: days[dates[20]!]!.slice() },
    };
    expect(errorsOf(validate(set([sameContinent]))).some((i) => i.code === "DAILY_REPEAT")).toBe(
      true,
    );
    const smalls = set().entities.filter(
      (e) => (e.area_km2?.value ?? 0) < 5000 && e.sets?.includes("sovereign-197"),
    );
    const fewSmall = {
      ...schedule,
      days: { ...days, [dates[300]!]: [smalls[0]!.id], [dates[302]!]: [smalls[1]!.id] },
    };
    expect(errorsOf(validate(set([fewSmall]))).some((i) => /under 5,000/.test(i.message))).toBe(
      true,
    );
  }, 180_000);
});
