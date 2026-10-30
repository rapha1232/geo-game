import { describe, expect, it } from "vitest";
import { makeRng } from "@meridian/game-kit";
import { EARTH_RADIUS_KM, haversineKm, type MultiPolygon } from "@meridian/geo";
import {
  DEFAULT_CONFIG,
  confirm,
  distanceToTarget,
  drawRun,
  eligibleFacts,
  placePin,
  rawScore,
  seededRun,
  startRun,
  takeHint,
  tick,
  total,
  type FactPinConfig,
  type PinFact,
} from "../src";

const KM_PER_DEG = (EARTH_RADIUS_KM * Math.PI) / 180;
const CONTINENTS = ["AF", "AS", "EU", "NA", "OC", "SA"];
const CATEGORIES = ["history", "nature", "culture", "science", "sport"];

const fact = (id: string, extra: Partial<PinFact> = {}): PinFact => ({
  id,
  text: "A fact.",
  answerLabel: "Somewhere",
  category: "history",
  era: "modern",
  precision: "city",
  target: { type: "point", coords: [10, 20] },
  reveal: "It happened here.",
  sources: [],
  difficulty: 0.5,
  entities: [],
  continent: "EU",
  status: "published",
  ...extra,
});

const none = () => undefined;
const run = (config: FactPinConfig, ids: string[]) => startRun(config, "0000000000", ids, 0);

describe("scoring", () => {
  it("AC-FP-001: a city fact 450 km away with 50 km tolerance scores 368", () => {
    const f = fact("f1", { precision: "city", toleranceKm: 50 });
    const pin = { lat: 10 + 450 / KM_PER_DEG, lon: 20 };
    expect(haversineKm(pin, { lat: 10, lon: 20 })).toBeCloseTo(450, 0);
    const s = confirm(placePin(run(DEFAULT_CONFIG, ["f1"]), pin), f, none, 1);
    expect(Math.abs((s.rounds[0]?.result?.score ?? 0) - 368)).toBeLessThanOrEqual(1);
    expect(rawScore(400, "city")).toBe(368);
  });

  const square: MultiPolygon = [
    [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0],
      ],
    ],
  ];
  const area = (): MultiPolygon => square;

  it("AC-FP-002: a pin inside an area target scores 1000", () => {
    const f = fact("a", { precision: "country", target: { type: "entity", id: "country:XXX" } });
    const s = confirm(placePin(run(DEFAULT_CONFIG, ["a"]), { lat: 1, lon: 1 }), f, area, 1);
    expect(s.rounds[0]?.result).toMatchObject({ distanceKm: 0, score: 1000 });
  });

  it("AC-FP-003: a pin 500 km outside a country-precision area scores about 607", () => {
    const f = fact("a", { precision: "country", target: { type: "entity", id: "country:XXX" } });
    const pin = { lat: 2 + 500 / KM_PER_DEG, lon: 1 };
    const d = distanceToTarget(f, pin, area);
    expect(d).toBeGreaterThan(495);
    expect(d).toBeLessThan(505);
    const s = confirm(placePin(run(DEFAULT_CONFIG, ["a"]), pin), f, area, 1);
    expect(Math.abs((s.rounds[0]?.result?.score ?? 0) - 607)).toBeLessThanOrEqual(5);
  });

  it("AC-FP-008: an area across the antimeridian counts pins on both sides as inside", () => {
    const fiji: MultiPolygon = [
      [
        [
          [177, -19],
          [-178, -19],
          [-178, -16],
          [177, -16],
          [177, -19],
        ],
      ],
    ];
    const f = fact("fj", { precision: "country", target: { type: "polygon", ref: "fiji" } });
    for (const lon of [178, 179.9, -179.9, -178.5]) {
      expect(distanceToTarget(f, { lat: -17, lon }, () => fiji)).toBe(0);
    }
    expect(distanceToTarget(f, { lat: -17, lon: -170 }, () => fiji)).toBeGreaterThan(500);
  });
});

describe("hints", () => {
  it("AC-FP-004: the continent hint caps the fact at 700", () => {
    const f = fact("c", {
      target: { type: "point", coords: [10, 20] },
      countries: ["country:AAA"],
    });
    let s = run(DEFAULT_CONFIG, ["c"]);
    s = takeHint(s, f, "continent");
    s = confirm(placePin(s, { lat: 10, lon: 20 }), f, none, 1);
    expect(s.rounds[0]?.result).toMatchObject({ rawScore: 1000, score: 700, cap: 700 });
  });

  it("AC-FP-004: the country hint caps at 400 and the lowest cap wins", () => {
    const f = fact("c", { countries: ["country:AAA"] });
    let s = run(DEFAULT_CONFIG, ["c"]);
    s = takeHint(takeHint(s, f, "continent"), f, "country");
    s = confirm(placePin(s, { lat: 10, lon: 20 }), f, none, 1);
    expect(s.rounds[0]?.result?.score).toBe(400);
  });

  it("AC-FP-004: the country hint is refused for a broad fact", () => {
    const f = fact("c", { precision: "broad", countries: ["country:AAA"] });
    const s = takeHint(run(DEFAULT_CONFIG, ["c"]), f, "country");
    expect(s.rounds[0]?.hints).toEqual([]);
  });

  it("AC-FP-005: placing a pin reveals nothing until it is confirmed", () => {
    const f = fact("p");
    const s = placePin(run(DEFAULT_CONFIG, ["p"]), { lat: 1, lon: 2 });
    expect(s.phase).toBe("asking");
    expect(s.rounds[0]?.result).toBeNull();
    expect(s.rounds[0]?.pin).toEqual({ lat: 1, lon: 2 });
    expect(confirm(s, f, none, 1).phase).toBe("revealed");
  });
});

describe("timer", () => {
  const timed: FactPinConfig = { ...DEFAULT_CONFIG, timerSec: 15 };

  it("AC-FP-006: at zero the current pin is confirmed", () => {
    const f = fact("t");
    let s = placePin(run(timed, ["t"]), { lat: 10, lon: 20 });
    expect(tick(s, f, none, 14_000).phase).toBe("asking");
    s = tick(s, f, none, 15_000);
    expect(s.phase).toBe("revealed");
    expect(s.rounds[0]?.result).toMatchObject({ score: 1000, timedOut: true });
  });

  it("AC-FP-007: at zero with no pin the fact scores 0", () => {
    const f = fact("t");
    const s = tick(run(timed, ["t"]), f, none, 15_000);
    expect(s.phase).toBe("revealed");
    expect(s.rounds[0]?.result).toMatchObject({ score: 0, timedOut: true });
    expect(total(s)).toBe(0);
  });

  it("AC-FP-007: confirming by hand with no pin does nothing", () => {
    const s = run(timed, ["t"]);
    expect(confirm(s, fact("t"), none, 1)).toBe(s);
  });
});

/** 200 facts over six continents and five categories, each with its own entity. */
const bank = (n: number): PinFact[] =>
  Array.from({ length: n }, (_, i) =>
    fact(`fact:${i}`, {
      continent: CONTINENTS[i % 6] as string,
      category: CATEGORIES[i % 5] as string,
      entities: [`e:${i}`],
      difficulty: (i % 10) / 10,
    }),
  );

describe("selection", () => {
  it("AC-FP-009: no fact repeats before 80% of a 200-fact pool has been seen", () => {
    const pool = bank(200);
    let seen: string[] = [];
    const drawn: string[] = [];
    for (let r = 0; r < 100; r++) {
      const d = drawRun(
        pool,
        DEFAULT_CONFIG,
        seen,
        5,
        makeRng("0000000001", "t", {}).fork(`r${r}`),
      );
      if (drawn.length < 160) {
        for (const id of d.ids) {
          expect(drawn).not.toContain(id);
          drawn.push(id);
        }
      }
      seen = d.seen;
    }
    expect(drawn.length).toBeGreaterThanOrEqual(160);
  });

  it("AC-FP-010: a run has at most 2 per continent and shares no entity", () => {
    const pool = bank(60).map((f, i) => ({ ...f, entities: [`e:${i % 40}`] }));
    for (let r = 0; r < 50; r++) {
      const d = drawRun(pool, DEFAULT_CONFIG, [], 5, makeRng("0000000002", "t", {}).fork(`r${r}`));
      const facts = d.ids.map((id) => pool.find((f) => f.id === id) as PinFact);
      expect(facts).toHaveLength(5);
      const per = new Map<string, number>();
      for (const f of facts) per.set(f.continent, (per.get(f.continent) ?? 0) + 1);
      expect(Math.max(...per.values())).toBeLessThanOrEqual(2);
      const ents = facts.flatMap((f) => f.entities);
      expect(new Set(ents).size).toBe(ents.length);
    }
  });

  it("AC-FP-014: suspended, draft and retired facts are never drawn", () => {
    const pool = bank(40).map((f, i) =>
      i % 2 === 0
        ? { ...f, status: ["suspended", "draft", "retired"][i % 3] as PinFact["status"] }
        : f,
    );
    const ok = eligibleFacts(pool, DEFAULT_CONFIG);
    expect(ok.every((f) => f.status === "published")).toBe(true);
    for (let r = 0; r < 30; r++) {
      const ids = seededRun(pool, DEFAULT_CONFIG, `000000${String(r).padStart(4, "0")}`);
      for (const id of ids) expect(pool.find((f) => f.id === id)?.status).toBe("published");
    }
  });

  it("AC-FP-015: a seed and config give the same facts every time", () => {
    const pool = bank(120);
    const a = seededRun(pool, DEFAULT_CONFIG, "0123456789");
    const b = seededRun(pool, DEFAULT_CONFIG, "0123456789");
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
    expect(seededRun(pool, DEFAULT_CONFIG, "9876543210")).not.toEqual(a);
  });
});

describe("performance (ARCHITECTURE §13)", () => {
  it("a confirm against a 40,000-vertex area takes at most 30 ms", () => {
    // A wiggly coastline: 40k vertices around a circle of radius ~5 degrees with noise.
    const ring: [number, number][] = [];
    for (let i = 0; i < 40_000; i++) {
      const a = (i / 40_000) * 2 * Math.PI;
      const r = 5 + 0.2 * Math.sin(a * 200);
      ring.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    ring.push(ring[0] as [number, number]);
    const big: MultiPolygon = [[ring]];
    const f = fact("big", { precision: "country", target: { type: "entity", id: "country:XXX" } });
    const pin = { lat: 20, lon: 20 }; // outside: the slower path, distance to the boundary
    distanceToTarget(f, pin, () => big); // warm up
    // Best of five, so a busy CI machine running other test suites cannot fail it.
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const s = confirm(placePin(run(DEFAULT_CONFIG, ["big"]), pin), f, () => big, 1);
      best = Math.min(best, performance.now() - t0);
      expect(s.phase).toBe("revealed");
    }
    expect(best).toBeLessThanOrEqual(30);
  });
});
