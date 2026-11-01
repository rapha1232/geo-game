import { describe, expect, it } from "vitest";
import type { Entity } from "@meridian/schemas";
import { buildIndicators, STATS } from "../src/indicators.ts";
import { indicatorRules } from "../src/validate/rules.ts";

const e = (iso: string, extra: Partial<Entity> = {}): Entity =>
  ({
    id: `country:${iso}`,
    type: "country",
    sets: ["sovereign-197"],
    population: { value: 1000, year: 2024, source: "wd" },
    area_km2: { value: 10, source: "ne" },
    capitals: [{ name: "X", role: "official", point: [48.85, 2.35] }],
    ...extra,
  }) as unknown as Entity;
const wb = {
  retrieved_on: "2026-11-01",
  endpoint: "x",
  indicators: { "NY.GDP.PCAP.CD": { FRA: [45000.4, 2024] as [number, number] } },
};

describe("core.indicators", () => {
  it("derives density, takes GDP from the World Bank snapshot and leaves gaps absent", () => {
    const p = buildIndicators([e("FRA"), e("TWN")], wb, "2026.11.0");
    expect(p.values["density"]?.["country:FRA"]).toEqual([100, 2024]);
    expect(p.values["gdp-per-capita"]?.["country:FRA"]).toEqual([45000, 2024]);
    expect(p.values["gdp-per-capita"]?.["country:TWN"]).toBeUndefined();
    expect(p.values["capital-latitude"]?.["country:FRA"]).toEqual([48.85, null]);
  });

  it("is deterministic and keyed in sorted order", () => {
    const a = buildIndicators([e("FRA"), e("DEU")], wb, "v");
    const b = buildIndicators([e("DEU"), e("FRA")], wb, "v");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("INDICATOR_COVERAGE rejects a thin statistic and unknown entities", () => {
    const p = buildIndicators([e("FRA")], wb, "v");
    const issues = indicatorRules({ entities: [e("FRA")], indicators: p } as never);
    expect(issues.some((i) => i.code === "INDICATOR_COVERAGE")).toBe(true);
    expect(STATS.map((s) => s.id)).toContain("capital-latitude");
  });
});

import { borderRunPairs, extendBorderRunSchedule } from "../src/daily.ts";
import { dailyRules } from "../src/validate/rules.ts";

describe("Border Run daily schedule", () => {
  const ids = Array.from({ length: 200 }, (_, i) => `country:C${String(i).padStart(3, "0")}`);
  // A path graph: C00 - C01 - ... - C29, so a pair i < j needs j - i - 1 countries between.
  const edges = ids.slice(1).map((b, i) => ({ a: ids[i] as string, b }));
  const pairs = borderRunPairs(ids, edges);

  it("only offers pairs with 3 to 5 countries in between", () => {
    expect(pairs.length).toBeGreaterThan(50);
    for (const p of pairs) {
      const [a, b] = p.split("|") as [string, string];
      const between = Math.abs(ids.indexOf(a) - ids.indexOf(b)) - 1;
      expect(between).toBeGreaterThanOrEqual(3);
      expect(between).toBeLessThanOrEqual(5);
    }
  });

  it("gives one route a day, deterministically, with no endpoint inside 14 days", () => {
    const a = extendBorderRunSchedule({ pairs, from: "2026-11-01", to: "2026-12-31", seed: "S" });
    const b = extendBorderRunSchedule({ pairs, from: "2026-11-01", to: "2026-12-31", seed: "S" });
    expect(a).toEqual(b);
    const dates = Object.keys(a.days).sort();
    expect(dates).toHaveLength(61);
    for (let i = 0; i < dates.length; i++)
      for (let j = i + 1; j < Math.min(dates.length, i + 15); j++) {
        const x = new Set(a.days[dates[i] as string]);
        for (const id of a.days[dates[j] as string] ?? []) expect(x.has(id)).toBe(false);
      }
  });

  it("extends an existing schedule without changing what is there", () => {
    const first = extendBorderRunSchedule({
      pairs,
      from: "2026-11-01",
      to: "2026-11-30",
      seed: "S",
    });
    const more = extendBorderRunSchedule({
      pairs,
      existing: first,
      from: "2026-11-01",
      to: "2026-12-15",
      seed: "S",
    });
    for (const d of Object.keys(first.days)) expect(more.days[d]).toEqual(first.days[d]);
    expect(Object.keys(more.days)).toHaveLength(45);
  });

  it("the validator rejects a day whose pair is not a Normal land route", () => {
    const schedule = extendBorderRunSchedule({
      pairs,
      from: "2026-11-01",
      to: "2026-11-03",
      seed: "S",
    });
    const bad = {
      ...schedule,
      days: { ...schedule.days, "2026-11-02": ["country:C00", "country:C01"] },
    };
    const issues = dailyRules({
      entities: ids.map((id) => ({ id, parent_ids: [] })),
      adjacency: edges,
      daily: [bad],
    } as never);
    expect(issues.some((i) => i.ref === "2026-11-02")).toBe(true);
    expect(dailyRules({ entities: [], adjacency: edges, daily: [schedule] } as never)).toEqual([]);
  });
});
