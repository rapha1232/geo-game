import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ambiguityGroup, dispute, type Entity } from "@meridian/schemas";
import { norm } from "@meridian/name-matcher";
import { buildPacks, type BuildOutput } from "../src/build.ts";
import { areaKm2, checkEditorialCoverage, parseEditorial } from "../src/editorial.ts";
import {
  contentSetFromBuild,
  errorsOf,
  validate,
  type ContentSet,
  type Issue,
} from "../src/validate/index.ts";
import { fixtureInput, repoPath } from "./helpers.ts";

const yaml = (f: string): Record<string, unknown> =>
  parse(readFileSync(repoPath(f), "utf8"), { schema: "core" }) as Record<string, unknown>;
const read = (f: string) => JSON.parse(readFileSync(repoPath(f), "utf8"));
const haveRaw = existsSync(repoPath("data/raw/ne/ne_10m_admin_0_countries.geojson"));

describe.skipIf(!haveRaw)("T1.1 real country content", () => {
  const members = (
    yaml("content/sets/sovereign-197.yaml") as { members: { code: string; un: boolean }[] }
  ).members;
  const editorial = parseEditorial(yaml("content/countries.yaml"));
  const ambiguity = (yaml("content/ambiguity.yaml").groups as unknown[]).map((g) =>
    ambiguityGroup.parse(g),
  );
  const disputes = (yaml("content/disputes.yaml").disputes as unknown[]).map((d) =>
    dispute.parse(d),
  );
  const input = fixtureInput({
    members,
    ne: {
      "110m": read("data/raw/ne/ne_110m_admin_0_countries.geojson"),
      "50m": read("data/raw/ne/ne_50m_admin_0_countries.geojson"),
      "10m": read("data/raw/ne/ne_10m_admin_0_countries.geojson"),
    },
    wikidata: read("data/snapshots/wikidata-countries.json"),
    editorial,
    ambiguity,
    disputes,
  });
  const out: BuildOutput = buildPacks(input);
  const set = (extra: Partial<ContentSet> = {}): ContentSet =>
    contentSetFromBuild(input, out, { fullSets: true, release: true, ...extra });
  const entities = set().entities;
  const byId = (code: string): Entity => entities.find((e) => e.id === `country:${code}`) as Entity;
  const codesOf = (issues: Issue[]) => [...new Set(issues.map((i) => i.code))];
  const known = (f: string) => (yaml(f).issues as never[]) ?? [];

  it("covers every member of sovereign-197 and nothing else", () => {
    expect(() =>
      checkEditorialCoverage(
        editorial,
        members.map((m) => m.code),
      ),
    ).not.toThrow();
    expect(() =>
      checkEditorialCoverage(
        editorial,
        members.slice(1).map((m) => m.code),
      ),
    ).toThrow();
  });

  it("AC-DATA-T1.1-001: SET_COUNT, ALIAS_COLLISION and CAPITAL_OUTSIDE pass on the reviewed pack, which is no longer a draft", () => {
    expect(set().draft).toBe(false);
    const issues = validate(
      set({
        knownGeometryIssues: known("content/overrides/known-geometry-issues.yaml"),
        knownCapitalIssues: known("content/overrides/known-capital-issues.yaml"),
      }),
    );
    expect(errorsOf(issues).map((i) => i.message)).toEqual([]);
  }, 180_000);

  it("AC-DATA-T1.1-002: canonical names follow the style guide (DATA_AND_CONTENT §5.3)", () => {
    const want: Record<string, string> = {
      CZE: "Czechia",
      TUR: "Türkiye",
      SWZ: "Eswatini",
      MKD: "North Macedonia",
      MMR: "Myanmar",
      CPV: "Cape Verde",
      TLS: "Timor-Leste",
      CIV: "Côte d'Ivoire",
      COD: "DR Congo",
      COG: "Republic of the Congo",
      USA: "United States",
      GBR: "United Kingdom",
      VAT: "Vatican City",
      PSE: "Palestine",
      TWN: "Taiwan",
      FSM: "Micronesia",
    };
    for (const [code, name] of Object.entries(want)) expect(byId(code).names.canonical).toBe(name);
  });

  it("AC-DATA-T1.1-003: aliases keep their kinds (former, official, common)", () => {
    const kind = (code: string, text: string) =>
      byId(code).names.aliases.find((a) => norm(a.text) === norm(text))?.kind;
    expect(kind("SWZ", "Swaziland")).toBe("former");
    expect(kind("MKD", "FYROM")).toBe("former");
    expect(kind("MMR", "Burma")).toBe("former");
    expect(kind("COD", "Zaire")).toBe("former");
    expect(kind("CPV", "Cabo Verde")).toBe("common");
    expect(kind("CZE", "Czech Republic")).toBe("common");
    expect(kind("DEU", "Deutschland")).toBe("endonym");
    expect(kind("FRA", "FRA")).toBe("code");
    expect(kind("TWN", "Republic of China")).toBe("official");
    expect(kind("PSE", "State of Palestine")).toBe("official");
  });

  it("AC-DATA-T1.1-004: contested capitals carry roles and notes (DATA_AND_CONTENT §7.1)", () => {
    const caps = (code: string) => byId(code).capitals?.map((c) => `${c.name}:${c.role}`);
    expect(caps("BOL")).toEqual(["Sucre:constitutional", "La Paz:seat_of_government"]);
    expect(caps("NLD")).toEqual(["Amsterdam:constitutional", "The Hague:seat_of_government"]);
    expect(caps("ISR")).toEqual(["Jerusalem:official"]);
    expect(byId("ISR").capitals?.[0]?.note).toMatch(/Tel Aviv/);
    expect(caps("PSE")).toEqual(["East Jerusalem:official", "Ramallah:seat_of_government"]);
    expect(caps("IDN")).toEqual(["Jakarta:official"]);
    expect(byId("IDN").capitals?.[0]?.note).toMatch(/Nusantara/);
    expect(byId("GNQ").capitals?.[0]).toMatchObject({
      name: "Ciudad de la Paz",
      valid_from: "2026-01-03",
    });
    for (const e of entities) expect(e.capitals?.length, e.id).toBeGreaterThan(0);
  });

  it("AC-DATA-T1.1-005: every country has a population and an area from its sources", () => {
    for (const e of entities) {
      expect(e.population?.value, e.id).toBeGreaterThan(0);
      expect(e.area_km2?.value, e.id).toBeGreaterThan(0);
    }
    const aus = byId("AUS").area_km2?.value ?? 0;
    expect(aus).toBeGreaterThan(7_400_000);
    expect(aus).toBeLessThan(7_900_000);
    expect(byId("VAT").area_km2?.value).toBeLessThan(5);
  });

  it("AC-DATA-T1.1-006: removing the Congo group makes the shared alias an error, and a group needs real members", () => {
    const without = validate(
      set({ ambiguity: ambiguity.filter((g) => g.group !== "congo"), draft: false }),
    );
    expect(
      errorsOf(without)
        .filter((i) => i.code === "ALIAS_COLLISION")
        .map((i) => i.ref),
    ).toEqual(["congo"]);
    const bogus = [
      ...ambiguity,
      {
        ...ambiguity[0]!,
        group: "x",
        alias: "Atlantis",
        members: ["country:FRA", "country:DEU"] as [string, string],
      },
    ];
    expect(codesOf(errorsOf(validate(set({ ambiguity: bogus }))))).toContain("ALIAS_COLLISION");
  });

  it("AC-DATA-T1.1-007: a capital outside its country fails unless it is a reviewed known issue", () => {
    const moved = entities.map((e) =>
      e.id === "country:FRA"
        ? {
            ...e,
            capitals: [
              { name: "Paris", role: "official" as const, point: [0, 0] as [number, number] },
            ],
          }
        : e,
    );
    const capitals = moved.flatMap((e) =>
      (e.capitals ?? []).flatMap((c) =>
        c.point ? [{ entityId: e.id, name: c.name, lat: c.point[0], lon: c.point[1] }] : [],
      ),
    );
    const issues = validate({ ...set(), entities: moved, capitals });
    expect(
      errorsOf(issues)
        .filter((i) => i.code === "CAPITAL_OUTSIDE")
        .map((i) => i.ref),
    ).toContain("country:FRA");
  }, 180_000);

  it("AC-DATA-T1.1-008: disputes name real entities, and a bad one is rejected", () => {
    expect(errorsOf(validate(set())).filter((i) => i.code === "DISPUTE_INVALID")).toEqual([]);
    const bad = [{ ...disputes[0]!, affects: ["country:ZZZ"] as `country:${string}`[] }];
    expect(codesOf(errorsOf(validate(set({ disputes: bad }))))).toContain("DISPUTE_INVALID");
    expect(disputes.map((d) => d.id)).toEqual(
      expect.arrayContaining([
        "kashmir-aksai-chin",
        "western-sahara",
        "crimea",
        "taiwan",
        "kosovo",
      ]),
    );
  }, 180_000);

  it("rebuilds to identical bytes (DETERMINISM)", () => {
    const again = buildPacks(input);
    expect(again.files.map((f) => f.sha256)).toEqual(out.files.map((f) => f.sha256));
  });
});

describe("areaKm2", () => {
  it("measures a 1°×1° box at the equator at about 12,300 km²", () => {
    const box: [number, number][] = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ];
    expect(areaKm2([[box]])).toBeGreaterThan(12_200);
    expect(areaKm2([[box]])).toBeLessThan(12_400);
  });
  it("subtracts holes", () => {
    const outer: [number, number][] = [
      [0, 0],
      [0, 2],
      [2, 2],
      [2, 0],
      [0, 0],
    ];
    const hole: [number, number][] = [
      [0.5, 0.5],
      [0.5, 1.5],
      [1.5, 1.5],
      [1.5, 0.5],
      [0.5, 0.5],
    ];
    expect(areaKm2([[outer, hole]])).toBeLessThan(areaKm2([[outer]]) * 0.8);
  });
});
