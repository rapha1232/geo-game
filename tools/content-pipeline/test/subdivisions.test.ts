import { describe, expect, it } from "vitest";
import type { Geometry } from "../src/geometry.ts";
import { SUBDIVISION_COUNTRIES, buildSubdivisions, type Admin1 } from "../src/subdivisions.ts";

const box = (x: number): Geometry =>
  ({
    type: "Polygon",
    coordinates: [
      [
        [x, 0],
        [x, 1],
        [x + 1, 1],
        [x + 1, 0],
        [x, 0],
      ],
    ],
  }) as Geometry;

/** A fixture with exactly the expected number of subdivisions for every country. */
function fixture(
  over: (code: string, i: number) => Partial<Admin1["features"][number]["properties"]> = () => ({}),
): Admin1 {
  const features: Admin1["features"] = [];
  for (const c of SUBDIVISION_COUNTRIES) {
    const extra = (c.exclude ?? []).map((name, i) => ({
      properties: {
        name,
        name_en: name,
        name_local: null,
        iso_3166_2: `${c.code.slice(0, 2)}-X${i}`,
        postal: null,
        adm0_a3: c.code,
        latitude: 0,
        longitude: 0,
      },
      geometry: box(100 + i),
    }));
    for (let i = 0; i < c.expected; i++)
      features.push({
        properties: {
          name: `${c.code} Place ${i}`,
          name_en: `${c.code} Place ${i}`,
          name_local: null,
          iso_3166_2: `${c.code.slice(0, 2)}-${String(i).padStart(2, "0")}`,
          postal: null,
          adm0_a3: c.code,
          latitude: 1,
          longitude: 2,
          ...over(c.code, i),
        },
        geometry: box(i * 2),
      });
    features.push(...extra);
  }
  return { features };
}

describe("subdivision packs", () => {
  it("builds an index and one outline per country, ids in the spec's form", () => {
    const { index, outlines } = buildSubdivisions(fixture(), "2026.11.0");
    expect(Object.keys(index.countries)).toHaveLength(12);
    expect(index.countries["USA"]?.subdivisions).toHaveLength(51);
    expect(index.countries["USA"]?.subdivisions[0]?.id).toMatch(/^subdivision:US-\d\d$/);
    expect(outlines.get("USA")?.features).toHaveLength(51);
  });

  it("drops remote parts listed for a country (Australia)", () => {
    const { index } = buildSubdivisions(fixture(), "v");
    expect(index.countries["AUS"]?.subdivisions).toHaveLength(8);
    expect(index.countries["AUS"]?.subdivisions.some((s) => /Macquarie|Jervis/.test(s.name))).toBe(
      false,
    );
  });

  it("fails loudly when a count is off (SUB_BOUNDS) or a code is missing", () => {
    const short = fixture();
    short.features.pop();
    expect(() => buildSubdivisions(short, "v")).toThrow(/expected/);
    const noCode = fixture((c, i) => (c === "ZAF" && i === 0 ? { iso_3166_2: null } : {}));
    expect(() => buildSubdivisions(noCode, "v")).toThrow(/no ISO 3166-2 code/);
  });

  it("keeps the postal code and English name as aliases, but never a label that is another place's name", () => {
    const f = fixture((c, i) =>
      c === "USA" && i === 0
        ? { postal: "AL", name_en: "USA Place 0" }
        : c === "USA" && i === 1
          ? { postal: "USA Place 5" }
          : {},
    );
    const { index } = buildSubdivisions(f, "v");
    const subs = index.countries["USA"]!.subdivisions;
    expect(subs[0]?.aliases).toEqual([{ text: "AL", kind: "code" }]);
    expect(subs[1]?.aliases).toEqual([]);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(buildSubdivisions(fixture(), "v").index)).toBe(
      JSON.stringify(buildSubdivisions(fixture(), "v").index),
    );
  });
});
