import { describe, expect, it } from "vitest";
import { makeRng } from "@meridian/game-kit";
import {
  DEFAULT_CONFIG,
  buildWorld,
  chooseStat,
  correctPairs,
  announceMove,
  move,
  newOrderRound,
  newRun,
  newTopPicks,
  orderPoints,
  pick,
  separated,
  submit,
  togglePick,
  topPoints,
  useHint,
  useLogScale,
  valueOf,
  yearRange,
  type RankConfig,
  type RankEntity,
  type StatDef,
  type StatValues,
} from "../src";

const continents = ["AF", "AS", "EU", "NA", "OC", "SA"];
const entities: RankEntity[] = Array.from({ length: 60 }, (_, i) => ({
  id: `country:C${String(i).padStart(2, "0")}`,
  name: `Country ${i}`,
  continent: continents[i % 6] as string,
  familiarity: (i % 10) / 10 + 0.05,
}));
const stat = (id: string, sep: StatDef["separation"], label = id): StatDef => ({
  id,
  label,
  unit: "u",
  sort: "desc",
  separation: sep,
  decimals: 0,
  source_id: "wb",
  source_note: "test",
});
const stats = [
  stat("population", { relative: 0.1 }),
  stat("area", { relative: 0.1 }),
  stat("capital-latitude", { absolute: 1 }),
];
const values: StatValues = { population: {}, area: {}, "capital-latitude": {} };
entities.forEach((e, i) => {
  (values["population"] as StatValues[string])[e.id] = [Math.round(1000 * 1.35 ** i), 2024];
  // A different order for area, and a gap in the data for every 7th entity.
  if (i % 7 !== 3)
    (values["area"] as StatValues[string])[e.id] = [Math.round(500 * 1.3 ** ((i * 7) % 60)), null];
  (values["capital-latitude"] as StatValues[string])[e.id] = [-60 + i * 2, null];
});
const w = buildWorld(entities, stats, values);
const rng = (seed: string, cfg: unknown = {}) => makeRng(seed, "rank-it", cfg);
const cfg = (patch: Partial<RankConfig> = {}): RankConfig => ({
  ...DEFAULT_CONFIG,
  stat: "population",
  ...patch,
});

const round = () => {
  const g = newOrderRound(w, cfg(), [], rng("r"));
  if (!g) throw new Error("no round");
  return g.round;
};

describe("order scoring", () => {
  const truth = ["a", "b", "c", "d", "e"];
  const base = {
    kind: "order" as const,
    stat: "population",
    scope: "world",
    truth,
    hint: null,
    status: "revealed" as const,
  };
  it("AC-RK-001 A, C, B, D, E against A > B > C > D > E scores 90", () => {
    expect(orderPoints({ ...base, arrangement: ["a", "c", "b", "d", "e"] })).toBe(90);
  });
  it("AC-RK-002 the correct order scores 100", () => {
    expect(orderPoints({ ...base, arrangement: truth })).toBe(100);
  });
  it("AC-RK-003 the reverse order scores 0", () => {
    expect(orderPoints({ ...base, arrangement: [...truth].reverse() })).toBe(0);
    expect(correctPairs([...truth].reverse(), truth)).toBe(0);
  });
  it("AC-RK-009 using the hint with a perfect order scores 80", () => {
    expect(orderPoints({ ...base, arrangement: truth, hint: { id: "a", position: 0 } })).toBe(80);
  });
});

describe("order rounds", () => {
  it("AC-RK-004 every generated Normal round respects the 10% separation rule", () => {
    let history: string[] = [];
    for (let i = 0; i < 200; i++) {
      const g = newOrderRound(w, cfg({ stat: "random" }), history, rng("sep", i));
      expect(g).not.toBeNull();
      const r = g!.round;
      history = g!.history;
      const def = w.statById.get(r.stat) as StatDef;
      const vals = r.truth.map((id) => valueOf(w, r.stat, id) as number);
      for (let a = 0; a < 5; a++)
        for (let b = a + 1; b < 5; b++)
          expect(separated(def, vals[a] as number, vals[b] as number)).toBe(true);
      expect(vals).toEqual([...vals].sort((x, y) => y - x));
    }
  });

  it("separates by 1° for latitude", () => {
    for (let i = 0; i < 30; i++) {
      const r = newOrderRound(w, cfg({ stat: "capital-latitude" }), [], rng("lat", i))!.round;
      const v = r.truth.map((id) => valueOf(w, r.stat, id) as number);
      for (let k = 1; k < v.length; k++)
        expect((v[k - 1] as number) - (v[k] as number)).toBeGreaterThanOrEqual(1);
    }
  });

  it("Easy uses familiar entities and a wider gap; Hard draws from a window of ranks", () => {
    for (let i = 0; i < 30; i++) {
      const easy = newOrderRound(w, cfg({ difficulty: "easy" }), [], rng("easy", i))!.round;
      for (const id of easy.truth) expect(w.byId.get(id)!.familiarity).toBeGreaterThan(0.6);
      const v = easy.truth.map((id) => valueOf(w, "population", id) as number);
      for (let k = 1; k < v.length; k++)
        expect(
          ((v[k - 1] as number) - (v[k] as number)) / (v[k - 1] as number),
        ).toBeGreaterThanOrEqual(0.3);
      const hard = newOrderRound(w, cfg({ difficulty: "hard" }), [], rng("hard", i))!.round;
      const rank = (id: string) => entities.findIndex((e) => e.id === id);
      const ranks = hard.truth.map(rank);
      expect(Math.max(...ranks) - Math.min(...ranks)).toBeLessThanOrEqual(30);
    }
  });

  it("never starts in the correct order", () => {
    for (let i = 0; i < 200; i++) {
      const r = newOrderRound(w, cfg(), [], rng("shuffle", i))!.round;
      expect(r.arrangement.join()).not.toBe(r.truth.join());
    }
  });

  it("AC-RK-011 the same seed gives the same entities and statistic", () => {
    const a = newOrderRound(w, cfg({ stat: "random" }), [], rng("same"))!.round;
    const b = newOrderRound(w, cfg({ stat: "random" }), [], rng("same"))!.round;
    expect(a).toEqual(b);
  });

  it("AC-RK-012 an entity without a value never appears for that statistic", () => {
    const missing = entities.filter((_, i) => i % 7 === 3).map((e) => e.id);
    for (let i = 0; i < 100; i++) {
      const r = newOrderRound(w, cfg({ stat: "area" }), [], rng("gap", i))!.round;
      for (const id of r.truth) expect(missing).not.toContain(id);
    }
  });

  it("respects the continent scope", () => {
    const r = newOrderRound(w, cfg({ scope: "EU" }), [], rng("eu"))!.round;
    for (const id of r.truth) expect(w.byId.get(id)!.continent).toBe("EU");
  });

  it("does not repeat a (statistic, entities) combination within the history window", () => {
    let history: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 150; i++) {
      const g = newOrderRound(w, cfg({ scope: "EU" }), history, rng("hist", i))!;
      expect(seen.has(g.combo)).toBe(false);
      seen.add(g.combo);
      history = g.history;
    }
  });

  it("keeps a random statistic from filling more than two rounds in a row", () => {
    const r = rng("stat");
    const history: string[] = [];
    const picks: string[] = [];
    for (let i = 0; i < 100; i++) {
      const s = chooseStat(w, cfg({ stat: "random" }), history, r.fork(String(i)))!;
      history.push(s.id);
      picks.push(s.id);
    }
    for (let i = 2; i < picks.length; i++)
      expect(picks[i] === picks[i - 1] && picks[i] === picks[i - 2]).toBe(false);
  });
});

describe("arranging", () => {
  it("AC-RK-006 moves an item up one place and says where it went", () => {
    const r = round();
    const before = r.arrangement;
    const moved = move(r, 2, 1);
    expect(moved.arrangement[1]).toBe(before[2]);
    expect(moved.arrangement[2]).toBe(before[1]);
    expect(announceMove("Brazil", 1, 5)).toBe("Brazil, moved to position 2 of 5");
  });

  it("ignores impossible moves and locks after submit", () => {
    const r = round();
    expect(move(r, 0, 0)).toBe(r);
    expect(move(r, 0, 9)).toBe(r);
    expect(move(submit(r), 0, 1).arrangement).toEqual(r.arrangement);
  });

  it("the hint reveals one true position, once, and costs 20", () => {
    const r = round();
    const hinted = useHint(r);
    expect(hinted.hint).not.toBeNull();
    expect(r.truth.indexOf(hinted.hint!.id)).toBe(hinted.hint!.position);
    expect(useHint(hinted)).toBe(hinted);
    const solved = { ...hinted, arrangement: hinted.truth };
    expect(orderPoints(solved)).toBe(80);
  });

  it("scores a submission without any move normally", () => {
    const r = submit(round());
    expect(orderPoints(r)).toBe(correctPairs(r.arrangement, r.truth) * 10);
  });
});

describe("higher or lower", () => {
  it("AC-RK-005 every pair differs by at least 5%", () => {
    let run = newRun(w, cfg(), [], rng("hl"))!;
    for (let i = 0; i < 40 && run.status === "playing"; i++) {
      const a = valueOf(w, run.stat, run.current) as number;
      const b = valueOf(w, run.stat, run.next) as number;
      expect(Math.abs(a - b) / Math.max(a, b)).toBeGreaterThanOrEqual(0.05);
      run = pick(w, cfg(), run, b > a ? "higher" : "lower", rng("hl-step", i));
    }
    expect(run.streak).toBeGreaterThan(5);
  });

  it("a correct pick extends the streak and a wrong one ends the run", () => {
    const run = newRun(w, cfg(), [], rng("hl2"))!;
    const a = valueOf(w, run.stat, run.current) as number;
    const b = valueOf(w, run.stat, run.next) as number;
    const right = pick(w, cfg(), run, b > a ? "higher" : "lower", rng("s"));
    expect(right.streak).toBe(1);
    expect(right.current).toBe(run.next);
    const wrong = pick(w, cfg(), run, b > a ? "lower" : "higher", rng("s"));
    expect(wrong.status).toBe("over");
    expect(wrong.streak).toBe(0);
    expect(pick(w, cfg(), wrong, "higher", rng("s"))).toBe(wrong);
  });

  it("never repeats an entity within a run", () => {
    let run = newRun(w, cfg(), [], rng("hl3"))!;
    for (let i = 0; i < 50 && run.status === "playing"; i++) {
      const a = valueOf(w, run.stat, run.current) as number;
      const b = valueOf(w, run.stat, run.next) as number;
      run = pick(w, cfg(), run, b > a ? "higher" : "lower", rng("hl3", i));
    }
    expect(new Set(run.used).size).toBe(run.used.length);
  });
});

describe("top picks", () => {
  const g = () => newTopPicks(w, cfg(), [], rng("tp"))!.round;
  it("AC-RK-008 picking ranks 1 to 5 scores 15", () => {
    let r = g();
    expect(r.grid).toHaveLength(16);
    for (const id of r.truth) r = togglePick(r, id);
    expect(topPoints(r)).toBe(15);
  });
  it("scores outside the top 5 as 0 and caps picks at 5", () => {
    let r = g();
    const outside = r.grid.filter((id) => !r.truth.includes(id));
    for (const id of outside.slice(0, 6)) r = togglePick(r, id);
    expect(r.picks).toHaveLength(5);
    expect(topPoints(r)).toBe(0);
    r = togglePick(r, outside[0] as string);
    expect(r.picks).toHaveLength(4);
  });
  it("gives rank points 5 down to 1", () => {
    let r = g();
    r = togglePick(r, r.truth[0] as string);
    expect(topPoints(r)).toBe(5);
    r = togglePick(r, r.truth[4] as string);
    expect(topPoints(r)).toBe(6);
  });
});

describe("display helpers", () => {
  it("AC-RK-010 uses a log scale when the largest value is over 100 times the smallest", () => {
    expect(useLogScale([5, 50, 600])).toBe(true);
    expect(useLogScale([5, 50, 500])).toBe(false);
    expect(useLogScale([1])).toBe(false);
  });
  it("AC-RK-007 reports the year range for the source footer", () => {
    expect(yearRange(w, "population", [entities[0]!.id, entities[1]!.id])).toBe("2024");
    expect(yearRange(w, "area", [entities[0]!.id])).toBeNull();
  });
});
