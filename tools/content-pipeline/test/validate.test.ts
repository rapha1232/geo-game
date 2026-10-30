import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { AdjacencyEdge, AmbiguityGroup, DailySchedule, Entity, Fact } from "@meridian/schemas";
import { buildPacks } from "../src/build.ts";
import {
  dropSlivers,
  normalizeGeometry,
  type Geometry,
  type PolygonCoords,
  type Ring,
} from "../src/geometry.ts";
import { sha256 } from "../src/util.ts";
import {
  checkDeterminism,
  contentSetFromBuild,
  errorsOf,
  polygonProblems,
  ringSelfIntersects,
  validate,
  type ContentSet,
  type Issue,
  type RuleCode,
} from "../src/validate/index.ts";
import { parseLock, verifyAgainstLock } from "../src/lock.ts";
import { SOURCES, WIKIDATA_SNAPSHOT } from "../src/sources.ts";
import { fixtureInput, repoPath } from "./helpers.ts";

const input = fixtureInput();
const built = buildPacks(input);
const base = (): ContentSet => contentSetFromBuild(input, built, { today: "2026-10-30" });
const codes = (issues: Issue[], level?: "error" | "warn"): RuleCode[] => [
  ...new Set(issues.filter((i) => !level || i.level === level).map((i) => i.code)),
];
const entity = (id: string): Entity => base().entities.find((e) => e.id === id) as Entity;
const sq = (x: number, y: number, s: number): Ring => [
  [x, y],
  [x, y + s],
  [x + s, y + s],
  [x + s, y],
  [x, y],
]; // clockwise

describe("baseline", () => {
  it("a real build of the fixture universe has no errors", () => {
    expect(errorsOf(validate(base()))).toEqual([]);
  });
});

describe("ID_FORMAT and ID_REUSED", () => {
  it("rejects ids that do not match ^[a-z]+:[A-Za-z0-9._-]+$", () => {
    for (const bad of ["FRA", "Country:FRA", "country:", "country:F R A", "country-FRA"]) {
      const c = { ...base(), entities: [{ ...entity("country:FRA"), id: bad } as Entity] };
      expect(codes(validate(c)), bad).toContain("ID_FORMAT");
    }
    expect(codes(validate(base()))).not.toContain("ID_FORMAT");
  });
  it("rejects an id retired in an earlier release", () => {
    const issues = validate({ ...base(), retiredIds: new Set(["country:FRA"]) });
    expect(issues.find((i) => i.code === "ID_REUSED")?.ref).toBe("country:FRA");
  });
});

describe("NAME_MISSING", () => {
  it("rejects a blank or symbols-only canonical name", () => {
    for (const name of ["", "   ", "!!!"]) {
      const c = {
        ...base(),
        entities: [{ ...entity("country:FRA"), names: { canonical: name, aliases: [] } } as Entity],
      };
      expect(codes(validate(c)), JSON.stringify(name)).toContain("NAME_MISSING");
    }
  });
});

describe("ALIAS_COLLISION", () => {
  const a = {
    ...entity("country:FRA"),
    names: { canonical: "Alpha", aliases: [{ text: "Shared Name", kind: "common" as const }] },
  } as Entity;
  const b = {
    ...entity("country:NOR"),
    names: { canonical: "Beta", aliases: [{ text: "the shared-name", kind: "common" as const }] },
  } as Entity;
  const group: AmbiguityGroup = {
    group: "shared",
    alias: "Shared Name",
    universe: "country",
    members: ["country:FRA", "country:NOR"],
    message: "Which one?",
  };

  it("fails when two entities share an alias key after norm(), even across punctuation and the article", () => {
    const issues = validate({ ...base(), entities: [a, b], draft: false });
    expect(issues.find((i) => i.code === "ALIAS_COLLISION")).toMatchObject({
      level: "error",
      ref: "sharedname",
    });
  });
  it("passes when every colliding entity is in an ambiguity group", () => {
    expect(codes(validate({ ...base(), entities: [a, b], ambiguity: [group] }))).not.toContain(
      "ALIAS_COLLISION",
    );
  });
  it("still fails when the group omits one of them", () => {
    expect(
      codes(
        validate({
          ...base(),
          entities: [a, b],
          ambiguity: [{ ...group, members: ["country:FRA", "country:AUS"] }],
        }),
      ),
    ).toContain("ALIAS_COLLISION");
  });
  it("is a warning while the pack is a draft, an error once it is not", () => {
    expect(
      validate({ ...base(), entities: [a, b], draft: true }).find(
        (i) => i.code === "ALIAS_COLLISION",
      )?.level,
    ).toBe("warn");
    expect(
      validate({ ...base(), entities: [a, b], draft: false }).find(
        (i) => i.code === "ALIAS_COLLISION",
      )?.level,
    ).toBe("error");
  });
  it("does not mix answer universes: a country and a city may share a name", () => {
    const city = { ...b, id: "city:gn-1", type: "city" as const } as unknown as Entity;
    expect(codes(validate({ ...base(), entities: [a, city] }))).not.toContain("ALIAS_COLLISION");
  });
  it("ignores translation aliases (they are only active when that language is enabled)", () => {
    const t = {
      ...b,
      names: {
        canonical: "Beta",
        aliases: [{ text: "Shared Name", kind: "translation" as const, lang: "es" }],
      },
    } as Entity;
    expect(codes(validate({ ...base(), entities: [a, t] }))).not.toContain("ALIAS_COLLISION");
  });
});

describe("SET_COUNT", () => {
  it("requires exactly 197 and 193 when the full set is checked", () => {
    const issues = validate({ ...base(), fullSets: true }).filter((i) => i.code === "SET_COUNT");
    expect(issues.map((i) => i.ref).sort()).toEqual(["sovereign-197", "un-193"]);
    expect(issues[0]?.message).toMatch(/has \d+ members, expected (197|193)/);
  });
  it("is not checked for partial fixtures", () =>
    expect(codes(validate(base()))).not.toContain("SET_COUNT"));
});

describe("GEOM_INVALID (polygon rules)", () => {
  const good: PolygonCoords = [sq(0, 0, 10)];
  it("accepts a clean polygon with a counter-clockwise hole", () => {
    const hole = [...sq(3, 3, 2)].reverse();
    expect(polygonProblems([sq(0, 0, 10), hole])).toEqual([]);
  });
  it("catches fewer than 4 positions, unclosed rings, bad coordinates, zero area and wrong winding", () => {
    expect(
      polygonProblems([
        [
          [0, 0],
          [1, 1],
          [0, 0],
        ],
      ]).join(),
    ).toMatch(/fewer than 4/);
    expect(
      polygonProblems([
        [
          [0, 0],
          [0, 5],
          [5, 5],
          [5, 0],
        ],
      ]).join(),
    ).toMatch(/not closed/);
    expect(
      polygonProblems([
        [
          [0, 0],
          [0, 5],
          [NaN, 5],
          [0, 0],
        ],
      ]).join(),
    ).toMatch(/invalid coordinate/);
    expect(
      polygonProblems([
        [
          [0, 0],
          [200, 5],
          [5, 5],
          [0, 0],
        ],
      ]).join(),
    ).toMatch(/invalid coordinate/);
    expect(
      polygonProblems([
        [
          [0, 0],
          [1, 1],
          [2, 2],
          [0, 0],
        ],
      ]).join(),
    ).toMatch(/zero area/);
    expect(polygonProblems([[...sq(0, 0, 10)].reverse()]).join()).toMatch(/wound the wrong way/);
    expect(polygonProblems([sq(0, 0, 10), sq(3, 3, 2)]).join()).toMatch(
      /hole 1 is wound the wrong way/,
    );
    expect(polygonProblems([])).toEqual(["has no rings"]);
  });
  it("catches a bow-tie (self-crossing) ring but allows rings that merely touch at a vertex", () => {
    const bowtie: Ring = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
      [0, 0],
    ];
    expect(ringSelfIntersects(bowtie)).toBe(true);
    const pinch: Ring = [
      [0, 0],
      [0, 4],
      [2, 2],
      [4, 4],
      [4, 0],
      [2, 2],
      [0, 0],
    ]; // touches itself at (2,2) without crossing
    expect(ringSelfIntersects(pinch)).toBe(false);
    expect(ringSelfIntersects(sq(0, 0, 10))).toBe(false);
  });
  it("finds a crossing in a large ring (the grid keeps this fast)", () => {
    const n = 20000;
    const ring: Ring = Array.from(
      { length: n },
      (_, i) =>
        [Math.cos((i / n) * 2 * Math.PI) * 50, Math.sin((i / n) * 2 * Math.PI) * 50] as [
          number,
          number,
        ],
    ).reverse();
    ring.push(ring[0] as [number, number]);
    expect(ringSelfIntersects(ring)).toBe(false);
    const bad = ring.slice();
    bad.splice(10000, 0, [0, 0], [60, 55], [-60, 55]); // the spike cuts the circle between vertices
    const t0 = Date.now();
    expect(ringSelfIntersects(bad)).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it("is reported per scale, and an acknowledged upstream defect becomes a warning only for that exact defect", () => {
    const geometry = base().geometry as NonNullable<ContentSet["geometry"]>;
    const bowtie: PolygonCoords = [
      [
        [0, 0],
        [10, 10],
        [10, 0],
        [0, 12],
        [0, 0],
      ],
    ];
    const broken = {
      ...geometry,
      "110m": new Map([...geometry["110m"], ["country:FRA", [bowtie]]]),
    };
    const issues = validate({ ...base(), geometry: broken }).filter(
      (i) => i.code === "GEOM_INVALID",
    );
    expect(
      issues.some(
        (i) =>
          i.level === "error" &&
          i.ref === "country:FRA" &&
          i.message.includes("at 110m") &&
          i.message.includes("crosses itself"),
      ),
    ).toBe(true);
    const known = [
      { entity: "country:FRA", scale: "110m" as const, problem: "crosses itself", reason: "test" },
    ];
    const ack = validate({ ...base(), geometry: broken, knownGeometryIssues: known }).filter(
      (i) => i.code === "GEOM_INVALID" && i.ref === "country:FRA",
    );
    // Only the acknowledged defect is downgraded. The bow-tie's other problems stay errors.
    const crossing = ack.filter((i) => i.message.includes("crosses itself"));
    expect(crossing.length).toBeGreaterThan(0);
    expect(
      crossing.every(
        (i) => i.level === "warn" && i.message.includes("known upstream defect: test"),
      ),
    ).toBe(true);
    const other = validate({
      ...base(),
      geometry: broken,
      knownGeometryIssues: [{ ...known[0]!, scale: "50m" as const }],
    }).filter((i) => i.code === "GEOM_INVALID" && i.ref === "country:FRA");
    expect(other.some((i) => i.level === "error")).toBe(true);
    void good;
  });
  it("an empty geometry is invalid", () => {
    const geometry = base().geometry as NonNullable<ContentSet["geometry"]>;
    const empty = { ...geometry, "50m": new Map([...geometry["50m"], ["country:FRA", []]]) };
    expect(
      validate({ ...base(), geometry: empty }).some(
        (i) => i.code === "GEOM_INVALID" && i.message.includes("empty geometry"),
      ),
    ).toBe(true);
  });
});

describe("dropSlivers", () => {
  it("drops polygons and holes smaller than a cell, keeps the rest, and returns null when nothing is left", () => {
    const g: Geometry = normalizeGeometry({
      type: "MultiPolygon",
      coordinates: [[sq(0, 0, 10), sq(1, 1, 0.01)], [sq(20, 20, 0.001)]],
    });
    const out = dropSlivers(g, 1e-3) as Extract<Geometry, { type: "MultiPolygon" }>;
    expect(out.coordinates).toHaveLength(1);
    expect(out.coordinates[0]).toHaveLength(1); // the tiny hole went too
    expect(dropSlivers(g, 1e6)).toBeNull();
  });
  it("keeps a Polygon a Polygon", () => {
    expect(
      dropSlivers(normalizeGeometry({ type: "Polygon", coordinates: [sq(0, 0, 5)] }), 1)?.type,
    ).toBe("Polygon");
  });
});

describe("GEOM_MISSING and REF_POINT_OUTSIDE", () => {
  it("GEOM_MISSING: names the entity and the scale", () => {
    const geometry = base().geometry as NonNullable<ContentSet["geometry"]>;
    const without = (m: Map<string, PolygonCoords[]>) =>
      new Map([...m].filter(([id]) => id !== "country:FJI"));
    const issues = validate({
      ...base(),
      geometry: { ...geometry, "10m": without(geometry["10m"]), "110m": without(geometry["110m"]) },
    }).filter((i) => i.code === "GEOM_MISSING");
    expect(issues.map((i) => i.message).sort()).toEqual([
      "country:FJI has no geometry at 10m",
      "country:FJI has no geometry at 110m",
    ]);
  });
  it("REF_POINT_OUTSIDE: a point in the sea fails, and the real one passes", () => {
    const moved = base().entities.map((e) =>
      e.id === "country:FRA" ? ({ ...e, ref_point: [0, -30] } as Entity) : e,
    );
    const issues = validate({ ...base(), entities: moved }).filter(
      (i) => i.code === "REF_POINT_OUTSIDE",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.ref).toBe("country:FRA");
    expect(codes(validate(base()))).not.toContain("REF_POINT_OUTSIDE");
  });
});

describe("ADJ_ASYMMETRIC", () => {
  const edge = (a: string, b: string, extra: Partial<AdjacencyEdge> = {}): AdjacencyEdge =>
    ({ a, b, ...extra }) as AdjacencyEdge;
  const run = (adjacency: AdjacencyEdge[]) =>
    validate({ ...base(), adjacency }).filter((i) => i.code === "ADJ_ASYMMETRIC");
  it("accepts canonical edges between real entities, including a crossing next to a land border", () => {
    expect(
      run([
        edge("country:FRA", "country:NOR", { length_km: 1 }),
        edge("country:FRA", "country:NOR", { crossing: true, type: "tunnel" }),
      ]),
    ).toEqual([]);
  });
  it("rejects reversed order, both directions, duplicates, self edges and unknown entities", () => {
    expect(run([edge("country:NOR", "country:FRA")]).join()).toBeTruthy();
    expect(
      run([edge("country:FRA", "country:NOR"), edge("country:NOR", "country:FRA")]).some(
        (i) => i.message.includes("canonical order") || i.message.includes("both directions"),
      ),
    ).toBe(true);
    expect(
      run([edge("country:FRA", "country:NOR"), edge("country:FRA", "country:NOR")]).some((i) =>
        i.message.includes("listed twice"),
      ),
    ).toBe(true);
    expect(
      run([edge("country:FRA", "country:FRA")]).some((i) => i.message.includes("self-edge")),
    ).toBe(true);
    expect(
      run([edge("country:FRA", "country:ZZZ")]).some((i) => i.message.includes("not an entity")),
    ).toBe(true);
  });
});

describe("CAPITAL_OUTSIDE", () => {
  it("a capital inside the country passes and one in another country fails with the distance", () => {
    const run = (lat: number, lon: number) =>
      validate({ ...base(), capitals: [{ entityId: "country:FRA", name: "X", lat, lon }] }).filter(
        (i) => i.code === "CAPITAL_OUTSIDE",
      );
    expect(run(48.8566, 2.3522)).toEqual([]);
    const far = run(52.52, 13.405);
    expect(far).toHaveLength(1);
    expect(far[0]?.message).toMatch(/km outside country:FRA \(tolerance 2 km\)/);
  });
  it("reports a capital whose country has no geometry", () => {
    expect(
      validate({
        ...base(),
        capitals: [{ entityId: "country:ZZZ", name: "X", lat: 0, lon: 0 }],
      }).some((i) => i.code === "CAPITAL_OUTSIDE"),
    ).toBe(true);
  });
});

const fact = (over: Partial<Fact> = {}): Fact => ({
  id: "fact:0001",
  text: "Roald Amundsen's expedition became the first to reach this point, in December 1911, after a long and difficult sledge journey across the ice.",
  answer_label: "South Pole",
  category: "history",
  era: "modern",
  precision: "exact",
  target: { type: "point", coords: [-90, 0] },
  tolerance_km: 25,
  reveal: "Reached on 14 December 1911.",
  sources: [{ title: "Amundsen", url: "https://www.wikidata.org/wiki/Q47538", license: "CC0" }],
  difficulty: 0.3,
  entities: [],
  status: "published",
  reviewed_at: "2026-10-01",
  review_due: null,
  ...over,
});

describe("FACT_NAMES_TARGET", () => {
  const run = (f: Fact) =>
    validate({ ...base(), facts: [f] }).filter((i) => i.code === "FACT_NAMES_TARGET");
  it("fails when the text contains the answer label, an alias of the target, or an alias of an entity at the same precision", () => {
    expect(
      run(
        fact({
          text: "Explorers raced to the South Pole in 1911, and one team under Amundsen arrived first.",
        }),
      ),
    ).toHaveLength(1);
    const country = fact({
      precision: "country",
      answer_label: "France",
      target: { type: "entity", id: "country:FRA" },
      entities: ["country:FRA"],
      tolerance_km: undefined,
      text: "This western European republic has Paris as its capital and borders Spain, and its flag is a vertical tricolour of blue, white and red.",
    });
    expect(run(country)).toEqual([]);
    expect(
      run({
        ...country,
        text: "The French Republic has Paris as its capital and borders Spain and Italy, and its flag is a vertical tricolour of blue, white and red.",
      }),
    ).toHaveLength(1);
    expect(
      run({
        ...country,
        text: "Napoleon crowned himself in Paris, and the nation he led, France, later sold Louisiana to the young United States of America in 1803.",
      }),
    ).toHaveLength(1);
  });
  it("matches whole words only, so naming a neighbour that merely contains the answer is fine", () => {
    const niger = fact({
      precision: "country",
      answer_label: "Niger",
      target: { type: "entity", id: "country:XKX" },
      entities: [],
      tolerance_km: undefined,
      text: "A landlocked Sahelian republic whose northern deserts border Algeria, and whose southern neighbour Nigeria is the most populous country in Africa.",
    });
    expect(run(niger)).toEqual([]);
    expect(
      run({
        ...niger,
        text: "A landlocked Sahelian republic named Niger, whose northern deserts border Algeria, and whose southern neighbour Nigeria is huge.",
      }),
    ).toHaveLength(1);
  });
  it("lets a finer fact name a coarser container (fact-pin §4.3: 'This Japanese city…')", () => {
    const city = fact({
      precision: "city",
      answer_label: "Kyoto",
      entities: ["country:NOR"],
      text: "This historic Norwegian city was the imperial capital for over a thousand years and is famous for its temples and gardens.",
    });
    expect(run(city)).toEqual([]);
  });
});

describe("FACT_NO_SOURCE and FACT_REVIEW_OVERDUE", () => {
  const run = (f: Fact, today = "2026-10-30") =>
    validate({ ...base(), today, facts: [f] }).filter(
      (i) => i.code === "FACT_NO_SOURCE" || i.code === "FACT_REVIEW_OVERDUE",
    );
  it("a published fact needs a source with a license; drafts do not", () => {
    expect(run(fact({ sources: [] }))[0]?.code).toBe("FACT_NO_SOURCE");
    expect(
      run(fact({ sources: [{ title: "x", url: "https://x.test", license: " " }] }))[0]?.code,
    ).toBe("FACT_NO_SOURCE");
    expect(run(fact({ sources: [], status: "draft", reviewed_at: null }))).toEqual([]);
    expect(run(fact())).toEqual([]);
  });
  it("overdue review: warning within 30 days, error after, nothing before the date or for drafts", () => {
    expect(run(fact({ review_due: "2026-11-30" }))).toEqual([]);
    expect(run(fact({ review_due: "2026-10-30" }))).toEqual([]);
    expect(run(fact({ review_due: "2026-10-20" }))[0]).toMatchObject({
      level: "warn",
      code: "FACT_REVIEW_OVERDUE",
    });
    expect(run(fact({ review_due: "2026-09-30" }))[0]).toMatchObject({ level: "warn" }); // exactly 30 days
    expect(run(fact({ review_due: "2026-09-29" }))[0]).toMatchObject({ level: "error" }); // 31 days
    expect(run(fact({ review_due: "2025-01-01", status: "draft" }))).toEqual([]);
  });
});

describe("QUOTA", () => {
  const continents = ["AF", "AS", "EU", "NA", "SA", "OC"];
  const entities = continents.map(
    (c) =>
      ({ ...entity("country:FRA"), id: `country:C${c}`, parent_ids: [`continent:${c}`] }) as Entity,
  );
  const mk = (n: number, pick: (i: number) => string, category: (i: number) => string): Fact[] =>
    Array.from({ length: n }, (_, i) =>
      fact({
        id: `fact:${String(i + 1).padStart(4, "0")}`,
        category: category(i),
        entities: [`country:C${pick(i)}`],
        target: { type: "entity", id: `country:C${pick(i)}` },
        precision: "country",
        tolerance_km: undefined,
        answer_label: `A${i}`,
        text: `Clue number ${i} about some far away place that has quite a few words to satisfy the length rule for published facts here.`,
      }),
    );
  const run = (facts: Fact[], quotas = true) =>
    validate({ ...base(), entities, facts, quotas }).filter((i) => i.code === "QUOTA");
  it("passes with 6 continents at ≥10% each and every category at ≥50", () => {
    expect(
      run(
        mk(
          300,
          (i) => continents[i % 6] as string,
          (i) => (i % 2 ? "history" : "nature"),
        ),
      ),
    ).toEqual([]);
  });
  it("fails a continent under 10% and a category under 50", () => {
    const issues = run(
      mk(
        300,
        (i) => (i % 20 === 0 ? "OC" : (continents[i % 5] as string)),
        (i) => (i < 30 ? "rare" : "history"),
      ),
    );
    expect(issues.some((i) => i.ref === "OC" && i.message.includes("minimum is 10%"))).toBe(true);
    // Only Oceania is short: the other five continents each hold well over 10%.
    expect(issues.filter((i) => i.message.includes("minimum is 10%")).map((i) => i.ref)).toEqual([
      "OC",
    ]);
    expect(issues.some((i) => i.ref === "rare" && i.message.includes("minimum is 50"))).toBe(true);
  });
  it("is off unless asked, and an empty bank cannot satisfy it", () => {
    expect(
      run(
        mk(
          10,
          () => "EU",
          () => "x",
        ),
        false,
      ),
    ).toEqual([]);
    expect(run([])[0]?.message).toMatch(/no published facts/);
  });
});

describe("DAILY_REPEAT", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10);
  const sil = (ids: string[]): DailySchedule => ({
    game: "silhouette",
    from: day(0),
    to: day(ids.length - 1),
    days: Object.fromEntries(ids.map((id, i) => [day(i), [id]])),
  });
  const run = (daily: DailySchedule[], extra: Partial<ContentSet> = {}) =>
    validate({ ...base(), daily, ...extra }).filter((i) => i.code === "DAILY_REPEAT");
  it("fails a target repeated inside the window (150 days for silhouette) and passes outside it", () => {
    const ids = Array.from({ length: 151 }, (_, i) => `country:X${i}`);
    expect(run([sil(ids)])).toEqual([]);
    const again = [...ids];
    again[149] = "country:X0";
    expect(run([sil(again)])[0]?.message).toMatch(/within the 150-day window/);
    again[149] = "country:X1";
    expect(run([sil(again)]).length).toBe(1);
    const far = [...ids, "country:X0"]; // day 151: allowed
    expect(run([sil(far)])).toEqual([]);
  });
  it("fails two consecutive silhouettes on the same continent", () => {
    const ents = [entity("country:FRA"), entity("country:NOR"), entity("country:AUS")];
    const issues = run([sil(["country:FRA", "country:NOR", "country:AUS"])], { entities: ents });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("continent:EU");
  });
  it("fails a Fact Pin day that repeats a category", () => {
    const facts = [
      fact({ id: "fact:0001", category: "history" }),
      fact({ id: "fact:0002", category: "history" }),
      fact({ id: "fact:0003", category: "nature" }),
    ];
    const s: DailySchedule = {
      game: "fact-pin",
      from: day(0),
      to: day(0),
      days: { [day(0)]: ["fact:0001", "fact:0002", "fact:0003"] },
    };
    expect(run([s], { facts }).some((i) => i.message.includes("five different categories"))).toBe(
      true,
    );
    const ok: DailySchedule = { ...s, days: { [day(0)]: ["fact:0001", "fact:0003"] } };
    expect(run([ok], { facts })).toEqual([]);
  });
});

describe("LICENSE_UNVERIFIED", () => {
  it("only release builds enforce it, and a pending source blocks the release", () => {
    const registry = {
      sources: base().registry!.sources.map((s) =>
        s.id === "ne" ? { ...s, verification: "pending" as const } : s,
      ),
    };
    expect(codes(validate({ ...base(), registry, usedSources: ["ne"] }))).not.toContain(
      "LICENSE_UNVERIFIED",
    );
    const issues = validate({ ...base(), registry, usedSources: ["ne"], release: true }).filter(
      (i) => i.code === "LICENSE_UNVERIFIED",
    );
    expect(issues[0]?.message).toBe("ne: verification is pending");
    expect(
      validate({ ...base(), release: true }).filter((i) => i.code === "LICENSE_UNVERIFIED"),
    ).toEqual([]);
  });
});

describe("DETERMINISM", () => {
  it("passes for the real build and fails when a build is not reproducible", () => {
    expect(checkDeterminism(() => buildPacks(input))).toEqual([]);
    let n = 0;
    const flaky = () => {
      const out = buildPacks(input);
      const file = out.files[0]!;
      return { ...out, files: [{ ...file, sha256: sha256(`run ${n++}`) }, ...out.files.slice(1)] };
    };
    const issues = checkDeterminism(flaky);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "DETERMINISM", level: "error", ref: "core.countries" });
  });
});

describe("pinned sources", () => {
  it("the committed Wikidata snapshot matches the hash pinned in data/sources.lock.yaml", () => {
    const lock = parseLock(readFileSync(repoPath("data/sources.lock.yaml"), "utf8"));
    const bytes = new Uint8Array(readFileSync(repoPath(WIKIDATA_SNAPSHOT.file)));
    expect(verifyAgainstLock(lock, WIKIDATA_SNAPSHOT.id, bytes)).toEqual({
      id: WIKIDATA_SNAPSHOT.id,
      ok: true,
    });
  });
  it("every downloadable source is pinned", () => {
    const lock = parseLock(readFileSync(repoPath("data/sources.lock.yaml"), "utf8"));
    for (const s of SOURCES)
      expect(
        lock.entries.find((e) => e.id === s.id),
        s.id,
      ).toBeTruthy();
  });
});

const haveRaw = existsSync(repoPath("data/raw/ne/ne_10m_admin_0_countries.geojson"));
describe.skipIf(!haveRaw)("real data: the full 197-country release validates", () => {
  it("has no errors at all, and its only warnings are the draft names and the acknowledged Sudan defect", () => {
    const read = (f: string) => JSON.parse(readFileSync(repoPath(f), "utf8"));
    const real = fixtureInput({
      members: (
        parse(readFileSync(repoPath("content/sets/sovereign-197.yaml"), "utf8"), {
          schema: "core",
        }) as { members: { code: string; un: boolean }[] }
      ).members,
      ne: {
        "110m": read("data/raw/ne/ne_110m_admin_0_countries.geojson"),
        "50m": read("data/raw/ne/ne_50m_admin_0_countries.geojson"),
        "10m": read("data/raw/ne/ne_10m_admin_0_countries.geojson"),
      },
      wikidata: read("data/snapshots/wikidata-countries.json"),
    });
    const known = (
      parse(readFileSync(repoPath("content/overrides/known-geometry-issues.yaml"), "utf8"), {
        schema: "core",
      }) as { issues: never[] }
    ).issues;
    const out = buildPacks(real);
    const issues = validate(
      contentSetFromBuild(real, out, { fullSets: true, release: true, knownGeometryIssues: known }),
    );
    expect(errorsOf(issues).map((i) => i.message)).toEqual([]);
    expect(codes(issues, "warn").sort()).toEqual(["ALIAS_COLLISION", "GEOM_INVALID"]);
    expect(issues.filter((i) => i.code === "GEOM_INVALID").map((i) => i.ref)).toEqual([
      "country:SDN",
    ]);
  }, 180_000);
});
