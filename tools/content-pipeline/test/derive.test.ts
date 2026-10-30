import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { feature } from "topojson-client";
import { parse } from "yaml";
import { ambiguityGroup, dispute } from "@meridian/schemas";
import { buildPacks } from "../src/build.ts";
import {
  adjacencyOverrides,
  buildAdjacency,
  difficultyPriors,
  silhouetteOverrides,
  splitParts,
} from "../src/derive.ts";
import { parseEditorial } from "../src/editorial.ts";
import type { PolygonCoords } from "../src/geometry.ts";
import { contentSetFromBuild, errorsOf, validate } from "../src/validate/index.ts";
import { fixtureInput, repoPath } from "./helpers.ts";

const sq = (x: number, y: number, s: number): PolygonCoords => [
  [
    [x, y],
    [x, y + s],
    [x + s, y + s],
    [x + s, y],
    [x, y],
  ],
];

describe("splitParts (silhouette §5.4)", () => {
  it("keeps polygons within 1,500 km of the largest and sends the rest to remote parts", () => {
    const r = splitParts([sq(0, 0, 10), sq(11, 0, 1), sq(60, 0, 2)]);
    expect(r.main).toHaveLength(2);
    expect(r.remote).toHaveLength(1);
    expect(r.remoteParts[0]?.area_km2).toBeGreaterThan(0);
    expect(r.archipelago).toBe(false);
  });
  it("widens the radius to 3,000 km when the largest polygon is under half the area", () => {
    const polys = [sq(0, 0, 3), sq(0, 20, 3), sq(0, 40, 3)];
    const r = splitParts(polys);
    expect(r.archipelago).toBe(true);
    expect(r.main.length).toBeGreaterThan(1);
  });
  it("moves polygons near an override point to the remote parts, never the largest", () => {
    const r = splitParts([sq(0, 0, 10), sq(11, 0, 1)], {
      entity: "country:AAA",
      reason: "test",
      drop: [{ near: [0.5, 11.5], within_km: 100 }],
    });
    expect(r.main).toHaveLength(1);
    expect(r.remote).toHaveLength(1);
  });
});

describe("adjacency edges", () => {
  const none = adjacencyOverrides.parse({});
  it("ADJ_ASYMMETRIC: edges are stored once in canonical order, and a border through an overseas part needs a name", () => {
    const contacts = [
      { a: "country:AAA", b: "country:BBB", polyA: new Set([2]), polyB: new Set([0]) },
    ];
    const counts = new Map([
      ["country:AAA", 1],
      ["country:BBB", 1],
    ]);
    expect(() => buildAdjacency(contacts, counts, none, [])).toThrow(/overseas/);
    const edges = buildAdjacency(
      contacts,
      counts,
      adjacencyOverrides.parse({ via: { "country:AAA~country:BBB": "Isle" } }),
      [],
    );
    expect(edges).toEqual([{ a: "country:AAA", b: "country:BBB", via: "Isle" }]);
  });
  it("flags a border between two claimants of the same dispute", () => {
    const contacts = [
      { a: "country:AAA", b: "country:BBB", polyA: new Set([0]), polyB: new Set([0]) },
    ];
    const counts = new Map([
      ["country:AAA", 1],
      ["country:BBB", 1],
    ]);
    const d = dispute.parse({
      id: "x",
      name: "X",
      administered_by: [],
      claimants: ["country:AAA", "country:BBB"],
      affects: ["country:AAA"],
      note: "n",
    });
    expect(buildAdjacency(contacts, counts, none, [d])[0]?.disputed).toBe(true);
  });
});

describe("difficulty priors", () => {
  it("rank by population and area, in [0, 1], harder when smaller", () => {
    const mk = (id: string, pop: number, area: number) =>
      ({ id, population: { value: pop }, area_km2: { value: area } }) as never;
    const out = difficultyPriors([
      mk("country:AAA", 1e3, 1),
      mk("country:BBB", 1e6, 1e3),
      mk("country:CCC", 1e9, 1e7),
    ]);
    const a = out.get("country:AAA")!;
    const c = out.get("country:CCC")!;
    expect(a.recall).toBe(1);
    expect(c.recall).toBe(0);
    expect(a.locate).toBeGreaterThan(c.locate);
    for (const v of Object.values(a)) expect(v).toBeGreaterThanOrEqual(0);
  });
});

const haveRaw = existsSync(repoPath("data/raw/ne/ne_10m_admin_0_countries.geojson"));
describe.skipIf(!haveRaw)("T1.2 real derived content", () => {
  const yaml = (f: string): Record<string, unknown> =>
    parse(readFileSync(repoPath(f), "utf8"), { schema: "core" }) as Record<string, unknown>;
  const read = (f: string) => JSON.parse(readFileSync(repoPath(f), "utf8"));
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
  });
  const out = buildPacks(input);
  const json = <T>(name: string): T =>
    JSON.parse(new TextDecoder().decode(out.files.find((f) => f.name === name)!.bytes));
  const topo = json<Parameters<typeof feature>[0]>("geo.silhouettes");
  const parts = (obj: string) =>
    new Map(
      (
        feature(topo, topo.objects[obj] as never) as unknown as {
          features: {
            id: string;
            properties: { remote_parts: { ref_point: [number, number]; area_km2: number }[] };
            geometry: { type: string; coordinates: unknown[] };
          }[];
        }
      ).features.map((f) => [f.id, f]),
    );
  const main = parts("main");
  const remote = parts("remote");
  const count = (f?: { geometry: { type: string; coordinates: unknown[] } }) =>
    !f ? 0 : f.geometry.type === "Polygon" ? 1 : f.geometry.coordinates.length;
  const edges = json<{ edges: { a: string; b: string; via?: string; disputed?: boolean }[] }>(
    "core.adjacency",
  ).edges;
  const entities = json<{ entities: { id: string; difficulty: Record<string, number> }[] }>(
    "core.countries",
  ).entities;

  it("AC-SH-009: France's silhouette is the mainland and Corsica; the overseas departments are remote parts", () => {
    expect(count(main.get("country:FRA"))).toBeLessThanOrEqual(3);
    expect(count(remote.get("country:FRA"))).toBeGreaterThanOrEqual(5);
    const big = remote.get("country:FRA")!.properties.remote_parts as {
      ref_point: [number, number];
      area_km2: number;
    }[];
    expect(big[0]?.ref_point[0]).toBeGreaterThan(3);
    expect(big[0]?.ref_point[1]).toBeLessThan(-52);
  });

  it("AC-SH-010: the United States silhouette excludes Alaska and Hawaii, and the editorial overrides hold", () => {
    const lats = (id: string, src = main) =>
      (src.get(id)!.geometry.coordinates as number[][][][]).flatMap((p) => p[0]!.map((c) => c[1]!));
    expect(Math.max(...lats("country:USA"))).toBeLessThan(50);
    expect(Math.min(...lats("country:USA"))).toBeGreaterThan(20);
    expect(count(remote.get("country:USA"))).toBeGreaterThan(5);
    expect(Math.min(...lats("country:ECU"))).toBeGreaterThan(-6);
    expect(Math.max(...lats("country:NOR"))).toBeLessThan(72);
    expect(Math.max(...lats("country:DNK"))).toBeLessThan(58);
    expect(Math.min(...lats("country:CHL"))).toBeLessThan(-50);
  });

  it("every entity has a non-empty silhouette", () => {
    expect(main.size).toBe(197);
  });

  it("adjacency: known land borders are present, sea neighbours are not, and overseas borders carry a via", () => {
    const has = (a: string, b: string) =>
      edges.some((e) => e.a === `country:${a < b ? a : b}` && e.b === `country:${a < b ? b : a}`);
    for (const [a, b] of [
      ["FRA", "ESP"],
      ["DNK", "DEU"],
      ["ESP", "MAR"],
      ["CAN", "USA"],
      ["KOR", "PRK"],
      ["DOM", "HTI"],
    ] as const)
      expect(has(a, b), `${a}~${b}`).toBe(true);
    for (const [a, b] of [
      ["DNK", "SWE"],
      ["RUS", "USA"],
      ["BHR", "SAU"],
      ["SGP", "MYS"],
    ] as const)
      expect(has(a, b), `${a}~${b}`).toBe(false);
    expect(edges.find((e) => e.a === "country:BRA" && e.b === "country:FRA")?.via).toBe(
      "French Guiana",
    );
    expect(edges.find((e) => e.a === "country:LTU" && e.b === "country:RUS")?.via).toBe(
      "Kaliningrad",
    );
    expect(edges.find((e) => e.a === "country:PRK" && e.b === "country:KOR")).toBeUndefined();
    expect(edges.length).toBeGreaterThan(280);
    expect(edges.length).toBeLessThan(350);
  });

  it("every country has a neighbour except the islands, and the validator accepts the pack", () => {
    const withNeighbour = new Set(edges.flatMap((e) => [e.a, e.b]));
    expect(withNeighbour.has("country:FRA") && withNeighbour.has("country:BRA")).toBe(true);
    expect(withNeighbour.has("country:AUS")).toBe(false);
    const issues = validate(
      contentSetFromBuild(input, out, {
        fullSets: true,
        release: true,
        knownGeometryIssues: yaml("content/overrides/known-geometry-issues.yaml").issues as never[],
        knownCapitalIssues: yaml("content/overrides/known-capital-issues.yaml").issues as never[],
      }),
    );
    expect(errorsOf(issues).map((i) => i.message)).toEqual([]);
  }, 180_000);

  it("difficulty priors are present for every entity and order sensibly", () => {
    expect(
      entities.every(
        (e) => e.difficulty && Object.values(e.difficulty).every((v) => v >= 0 && v <= 1),
      ),
    ).toBe(true);
    const d = (id: string) => entities.find((e) => e.id === `country:${id}`)!.difficulty;
    expect(d("VAT")!.locate).toBeGreaterThan(d("CHN")!.locate!);
    expect(d("VAT")!.recall).toBeGreaterThan(d("IND")!.recall!);
  });

  it("rebuilds to identical bytes (DETERMINISM)", () => {
    expect(buildPacks(input).files.map((f) => f.sha256)).toEqual(out.files.map((f) => f.sha256));
  }, 180_000);
});
