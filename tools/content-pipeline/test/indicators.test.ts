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
