import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ambiguityGroup, dispute, fact, type Entity, type Fact } from "@meridian/schemas";
import { buildPacks } from "../src/build.ts";
import { adjacencyOverrides, silhouetteOverrides } from "../src/derive.ts";
import { parseEditorial } from "../src/editorial.ts";
import {
  authoredFile,
  buildFacts,
  readPopulatedPlaces,
  toFact,
  type AuthoredFact,
} from "../src/facts.ts";
import { contentSetFromBuild, errorsOf, validate } from "../src/validate/index.ts";
import { fixtureInput, repoPath } from "./helpers.ts";

const dir = repoPath("content/facts");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".yaml"))
  .sort();
const authored = files.map((f) => ({
  name: f,
  file: authoredFile.parse(parse(readFileSync(`${dir}/${f}`, "utf8"), { schema: "core" })),
}));

describe("curated fact files", () => {
  const all = authored.flatMap((a) => a.file.facts);
  it("have unique ids in their category's range, and every category has facts", () => {
    expect(new Set(all.map((f) => f.id)).size).toBe(all.length);
    const range: Record<string, string> = {
      history: "1",
      nature: "2",
      culture: "3",
      science: "4",
      sport: "5",
    };
    for (const f of all) expect(f.id.slice(5, 6), f.id).toBe(range[f.c]);
    expect([...new Set(all.map((f) => f.c))].sort()).toEqual([
      "culture",
      "history",
      "nature",
      "science",
      "sport",
    ]);
    expect(all.length).toBeGreaterThanOrEqual(100);
  });
  it("write 12 to 35 words, cite a source with a URL, and give coordinates in range", () => {
    for (const f of all) {
      const words = f.t.trim().split(/\s+/).length;
      expect(words, f.id).toBeGreaterThanOrEqual(12);
      expect(words, f.id).toBeLessThanOrEqual(35);
      for (const s of Array.isArray(f.s) ? f.s : [f.s])
        expect(s.split("|")[1], f.id).toMatch(/^https:\/\//);
      if (f.at) {
        expect(Math.abs(f.at[0]), f.id).toBeLessThanOrEqual(90);
        expect(Math.abs(f.at[1]), f.id).toBeLessThanOrEqual(180);
      }
    }
  });
  it("time-sensitive facts carry a review date at most a year out", () => {
    for (const f of all.filter((x) => /tallest|largest|highest|current/i.test(x.t)))
      expect(f.review_due, f.id).toBeDefined();
  });
});

describe("toFact", () => {
  const ent = new Map<string, Entity>([
    ["country:FRA", { id: "country:FRA", parent_ids: ["continent:EU"] } as Entity],
  ]);
  const base: AuthoredFact = {
    id: "fact:9999",
    c: "history",
    e: "modern",
    p: "city",
    at: [48.85, 2.35],
    tol: 10,
    d: 0.3,
    a: "Paris",
    in: ["country:FRA"],
    t: "A city on a river, founded long ago, famous for a tall iron tower built for an exhibition in the eighteen eighties.",
    r: "Paris.",
    s: "Paris|https://en.wikipedia.org/wiki/Paris",
  };
  it("builds a published fact with the continent from its country and a place entity", () => {
    const f = toFact(base, "2026-10-30", ent);
    expect(f).toMatchObject({
      status: "published",
      continent: "EU",
      reviewed_at: "2026-10-30",
      entities: ["country:FRA", "place:paris"],
    });
    expect(f.sources[0]?.license).toMatch(/CC BY-SA/);
  });
  it("needs a continent, a known country and a target", () => {
    expect(() => toFact({ ...base, in: [] }, "2026-10-30", ent)).toThrow(/no continent/);
    expect(toFact({ ...base, in: [], k: "EU" }, "2026-10-30", ent).continent).toBe("EU");
    expect(() => toFact({ ...base, in: ["country:ZZZ"], k: "EU" }, "2026-10-30", ent)).toThrow(
      /unknown entities/,
    );
    expect(() => toFact({ ...base, at: undefined }, "2026-10-30", ent)).toThrow(
      /needs "at" or "ent"/,
    );
  });
  it("rejects a text that is too short for a published fact", () => {
    expect(() => toFact({ ...base, t: "Too short." }, "2026-10-30", ent)).toThrow();
  });
});

describe("readPopulatedPlaces", () => {
  it("keeps name, country (with Natural Earth's code fixes), population and capital status", () => {
    const places = readPopulatedPlaces({
      features: [
        {
          properties: {
            name: "Pristina",
            adm0_a3: "KOS",
            pop_max: 200000,
            featurecla: "Admin-0 capital",
            latitude: 42.67,
            longitude: 21.16,
          },
        },
        {
          properties: {
            name: "Lagos",
            adm0_a3: "NGA",
            pop_max: 8000000,
            featurecla: "Populated place",
            latitude: 6.45,
            longitude: 3.4,
          },
        },
        { properties: { adm0_a3: "NGA" } },
      ],
    });
    expect(places).toEqual([
      { name: "Pristina", country: "XKX", pop: 200000, capital: true, lat: 42.67, lon: 21.16 },
      { name: "Lagos", country: "NGA", pop: 8000000, capital: false, lat: 6.45, lon: 3.4 },
    ]);
  });
});

const haveRaw =
  existsSync(repoPath("data/raw/ne/ne_10m_populated_places_simple.geojson")) &&
  existsSync(repoPath("data/raw/ne/ne_10m_admin_0_countries.geojson"));
describe.skipIf(!haveRaw)("T1.12 the real fact bank", () => {
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
    factSources: {
      authored: authored.map((a) => ({ file: a.file })),
      places: readPopulatedPlaces(read("data/raw/ne/ne_10m_populated_places_simple.geojson")),
    },
  });
  const out = buildPacks(input);
  const facts = (
    JSON.parse(new TextDecoder().decode(out.files.find((f) => f.name === "facts.v1")!.bytes)) as {
      facts: Fact[];
    }
  ).facts;

  it("builds curated, capital and city facts, all valid, with every continent present", () => {
    expect(facts.filter((f) => f.generated && f.id.startsWith("fact:8"))).toHaveLength(197);
    expect(facts.filter((f) => f.generated && f.id.startsWith("fact:9"))).toHaveLength(300);
    expect(facts.every((f) => fact.safeParse(f).success)).toBe(true);
    expect(facts.every((f) => f.continent)).toBe(true);
    expect(new Set(facts.map((f) => f.continent)).size).toBe(6);
    expect(new Set(facts.map((f) => f.id)).size).toBe(facts.length);
  });
  it("capital facts point at the capital and say which country, without a clue to pin by", () => {
    const peru = facts.find(
      (f) => f.entities.includes("country:PER") && f.id.startsWith("fact:8"),
    )!;
    expect(peru.text).toBe("Pin the capital of Peru.");
    expect(peru.answer_label).toBe("Lima");
    expect(peru.target).toMatchObject({ type: "point" });
  });
  it("city facts skip capitals and take the largest places first", () => {
    const cities = facts.filter((f) => f.id.startsWith("fact:9"));
    const capitals = new Set(
      facts.filter((f) => f.id.startsWith("fact:8")).map((f) => f.answer_label),
    );
    expect(cities.some((c) => capitals.has(c.answer_label))).toBe(false);
    expect(cities[0]!.difficulty).toBeLessThan(cities[299]!.difficulty);
  });
  it("AC-FP-013: a self-naming fact fails with FACT_NAMES_TARGET, and the real bank passes", () => {
    const set = contentSetFromBuild(input, out, { fullSets: true });
    expect(errorsOf(validate(set)).filter((i) => i.code.startsWith("FACT"))).toEqual([]);
    const bad: Fact = {
      ...facts.find((f) => f.id === "fact:1003")!,
      id: "fact:9990",
      precision: "country",
      target: { type: "entity", id: "country:PER" },
      text: "This citadel high in the Andes of Peru was built by the Incas in the fifteenth century and rediscovered in 1911.",
    };
    const issues = validate({ ...set, facts: [...set.facts!, bad] });
    expect(issues.some((i) => i.code === "FACT_NAMES_TARGET" && i.ref === "fact:9990")).toBe(true);
  }, 180_000);
  it("buildFacts is deterministic and refuses duplicate ids", () => {
    const entities = (
      JSON.parse(
        new TextDecoder().decode(out.files.find((f) => f.name === "core.countries")!.bytes),
      ) as { entities: Entity[] }
    ).entities;
    const places = readPopulatedPlaces(read("data/raw/ne/ne_10m_populated_places_simple.geojson"));
    const once = buildFacts({
      authored: authored.map((a) => ({ file: a.file })),
      entities,
      places,
      reviewedAt: "2026-10-30",
    });
    expect(once.map((f) => f.id)).toEqual(facts.map((f) => f.id));
    expect(() =>
      buildFacts({
        authored: [...authored, ...authored].map((a) => ({ file: a.file })),
        entities,
        places,
        reviewedAt: "2026-10-30",
      }),
    ).toThrow(/duplicate fact id/);
  });
});
