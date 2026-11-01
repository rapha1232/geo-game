import { describe, expect, it } from "vitest";
import { makeRng } from "@meridian/game-kit";
import {
  DEFAULT_CONFIG,
  buildGraph,
  distances,
  groups,
  guessEntity,
  guessesLeft,
  initials,
  nextOutline,
  pairPool,
  pathLength,
  roundPoints,
  selectPair,
  shortestPaths,
  startRound,
  submitGuess,
  useHint,
  type BrWorld,
  type RoundState,
} from "../src";
import { id, makeWorld } from "./helpers";

const w = makeWorld();
const spainPoland = (mode: "unlimited" | "practice" = "unlimited"): RoundState =>
  startRound(w, { a: id("ESP"), b: id("POL"), mode, config: DEFAULT_CONFIG });

const play = (s: RoundState, names: string[], world: BrWorld = w): RoundState =>
  names.reduce((cur, n) => submitGuess(world, cur, n).state, s);

describe("route length", () => {
  it("AC-BR-001 L is computed by breadth-first search: Spain to Poland is 3 borders, m = 2", () => {
    expect(pathLength(w.graph, id("ESP"), id("POL"))).toBe(3);
    expect(spainPoland().m).toBe(2);
  });

  it("lists every shortest route, in a stable order, up to the limit", () => {
    const paths = shortestPaths(w.graph, id("ESP"), id("POL"));
    expect(paths.map((p) => p.map((x) => x.slice(8)).join(">"))).toEqual(["ESP>FRA>DEU>POL"]);
    expect(shortestPaths(w.graph, id("FRA"), id("CZE"), 1)).toHaveLength(1);
  });

  it("refuses a pair that touches or is not connected", () => {
    expect(() =>
      startRound(w, { a: id("ESP"), b: id("FRA"), mode: "unlimited", config: DEFAULT_CONFIG }),
    ).toThrow();
    expect(() =>
      startRound(w, { a: id("ESP"), b: id("JPN"), mode: "unlimited", config: DEFAULT_CONFIG }),
    ).toThrow();
  });
});

describe("guessing", () => {
  it("AC-BR-002 wins on a connected path: France and Germany win Spain to Poland in 2 guesses for 10 points", () => {
    const s = play(spainPoland(), ["France", "Germany"]);
    expect(s.status).toBe("won");
    expect(s.guesses).toHaveLength(2);
    expect(roundPoints(s)).toBe(10);
  });

  it("AC-BR-003 classifies by hop distance: Italy is off route, Switzerland is close", () => {
    const s = play(spainPoland(), ["Italy", "Switzerland"]);
    expect(s.guesses.map((g) => g.cls)).toEqual(["off-route", "near"]);
    const off = play(spainPoland(), ["Portugal", "Japan"]);
    expect(off.guesses.map((g) => g.cls)).toEqual(["off-route", "off-route"]);
    const on = play(spainPoland(), ["France"]);
    expect(on.guesses[0]?.cls).toBe("on-route");
  });

  it("AC-BR-004 the budget is m + 4: six non-winning guesses lose and the route is revealed", () => {
    expect(guessesLeft(spainPoland())).toBe(6);
    const s = play(spainPoland(), [
      "Portugal",
      "Belgium",
      "Italy",
      "Switzerland",
      "Austria",
      "Czechia",
    ]);
    expect(s.status).toBe("lost");
    expect(s.guesses).toHaveLength(6);
    expect(guessesLeft(s)).toBe(0);
  });

  it("practice has no budget", () => {
    const s = play(spainPoland("practice"), [
      "Portugal",
      "Belgium",
      "Italy",
      "Switzerland",
      "Austria",
      "Czechia",
    ]);
    expect(s.status).toBe("routing");
    expect(guessesLeft(s)).toBeNull();
    expect(roundPoints(play(s, ["France", "Germany"]))).toBe(0);
  });

  it("AC-BR-005 an invalid name does not use a guess", () => {
    const r = submitGuess(w, spainPoland(), "Narnia");
    expect(r.event.kind).toBe("not-recognized");
    expect(r.state.guesses).toHaveLength(0);
  });

  it("AC-BR-006 naming an endpoint, or a country again, does not use a guess", () => {
    const first = submitGuess(w, spainPoland(), "Spain");
    expect(first.event).toEqual({ kind: "on-map", entityId: id("ESP") });
    expect(first.state.guesses).toHaveLength(0);
    const once = play(spainPoland(), ["Italy"]);
    const again = submitGuess(w, once, "Italy");
    expect(again.event.kind).toBe("already-guessed");
    expect(again.state.guesses).toHaveLength(1);
  });

  it("a longer connected path also wins, and the score reflects the extra guesses", () => {
    const s = play(spainPoland(), ["France", "Italy", "Austria", "Czechia"]);
    expect(s.status).toBe("won");
    expect(s.guesses).toHaveLength(4);
    expect(roundPoints(s)).toBe(6);
  });

  it("ignores guesses after the round ends", () => {
    const won = play(spainPoland(), ["France", "Germany"]);
    expect(submitGuess(w, won, "Italy").event.kind).toBe("round-over");
  });

  it("reports the connected groups for the text list (border-run §10)", () => {
    const s = play(spainPoland(), ["France", "Czechia"]);
    expect(groups(w, s).map((g) => g.map((x) => x.slice(8)))).toEqual([
      ["ESP", "FRA"],
      ["CZE", "POL"],
    ]);
  });
});

describe("scoring", () => {
  it("AC-BR-010 m = 3, 5 guesses and 1 hint scores 4", () => {
    const s: RoundState = {
      a: id("ESP"),
      b: id("POL"),
      mode: "unlimited",
      config: DEFAULT_CONFIG,
      m: 3,
      status: "won",
      guesses: Array.from({ length: 5 }, (_, i) => ({
        entityId: `x${i}`,
        input: "",
        cls: "near" as const,
      })),
      hints: [{ kind: "initials" }],
      gaveUp: false,
    };
    expect(roundPoints(s)).toBe(4);
  });

  it("never scores below 1 on a win and 0 on a loss", () => {
    const base = play(spainPoland(), ["France", "Germany"]);
    expect(
      roundPoints({
        ...base,
        hints: Array.from({ length: 9 }, () => ({ kind: "initials" as const })),
      }),
    ).toBe(1);
    expect(roundPoints({ ...base, status: "lost" })).toBe(0);
  });
});

describe("hints", () => {
  it("initials show the first letters of one shortest route's intermediates", () => {
    expect(initials(w, spainPoland())).toEqual(["F", "G"]);
  });

  it("next outline picks an unrevealed on-route country next to the revealed part", () => {
    expect(nextOutline(w, spainPoland())).toBe(id("FRA"));
    expect(nextOutline(w, play(spainPoland(), ["France"]))).toBe(id("DEU"));
  });

  it("reveal one counts as a guess and a hint, and can finish the round", () => {
    let s = useHint(w, spainPoland(), "reveal");
    expect(s.guesses).toHaveLength(1);
    expect(s.hints).toHaveLength(1);
    s = useHint(w, s, "reveal");
    expect(s.status).toBe("won");
    expect(roundPoints(s)).toBe(10 - 2 * 2);
  });

  it("initials can be used once", () => {
    const s = useHint(w, spainPoland(), "initials");
    expect(useHint(w, s, "initials")).toBe(s);
  });
});

describe("crossings", () => {
  it("AC-BR-007 a border reached only through an overseas part is an ordinary edge", () => {
    const g = buildGraph(["country:BRA", "country:FRA"], [{ a: "country:BRA", b: "country:FRA" }]);
    expect(g.get("country:BRA")).toEqual(["country:FRA"]);
  });

  it("AC-BR-009 with crossings on, United Kingdom to Belgium is valid with L = 2 via France", () => {
    const on = makeWorld(true);
    expect(pathLength(on.graph, id("GBR"), id("BEL"))).toBe(2);
    expect(shortestPaths(on.graph, id("GBR"), id("BEL"))[0]).toEqual([
      id("GBR"),
      id("FRA"),
      id("BEL"),
    ]);
    expect(pathLength(w.graph, id("GBR"), id("BEL"))).toBeNull();
  });
});

describe("pairs", () => {
  const grid = (n: number): BrWorld["graph"] => {
    const ids: string[] = [];
    const edges: { a: string; b: string }[] = [];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        ids.push(`g${y}_${x}`);
        if (x + 1 < n) edges.push({ a: `g${y}_${x}`, b: `g${y}_${x + 1}` });
        if (y + 1 < n) edges.push({ a: `g${y}_${x}`, b: `g${y + 1}_${x}` });
      }
    return buildGraph(ids, edges);
  };

  it("AC-BR-008 isolated countries are never endpoints while crossings are off", () => {
    const pool = pairPool(w.graph, { ...DEFAULT_CONFIG, route: "easy" }, () => undefined);
    expect(pool.length).toBeGreaterThan(0);
    for (const p of pool) expect(p).not.toContain("JPN");
    expect(distances(w.graph, id("JPN")).size).toBe(1);
  });

  it("filters by route length and by region", () => {
    const g = grid(8);
    for (const route of ["easy", "normal", "hard"] as const) {
      const [lo, hi] = { easy: [2, 3], normal: [3, 5], hard: [5, 8] }[route];
      for (const p of pairPool(g, { ...DEFAULT_CONFIG, route }, () => undefined).slice(0, 200)) {
        const [a, b] = p.split("|") as [string, string];
        const m = (pathLength(g, a, b) as number) - 1;
        expect(m).toBeGreaterThanOrEqual(lo as number);
        expect(m).toBeLessThanOrEqual(hi as number);
      }
    }
    const eu = pairPool(
      w.graph,
      { ...DEFAULT_CONFIG, region: "EU", route: "easy" },
      (x) => w.world.byId.get(x)?.continent,
    );
    expect(eu.every((p) => !p.includes("MAR"))).toBe(true);
  });

  it("AC-BR-011 the same seed gives the same A and B", () => {
    const pool = pairPool(grid(8), DEFAULT_CONFIG, () => undefined);
    const pick = () => selectPair(pool, [], makeRng("seed-1", "border-run", DEFAULT_CONFIG));
    expect(pick()).toMatchObject({ a: pick().a, b: pick().b });
  });

  it("AC-BR-012 over 200 rounds no pair repeats and no endpoint recurs within 5 rounds", () => {
    const pool = pairPool(grid(8), DEFAULT_CONFIG, () => undefined);
    const rng = makeRng("long-run", "border-run", DEFAULT_CONFIG);
    let history: readonly string[] = [];
    const seen = new Set<string>();
    const lastEndpoints: string[][] = [];
    for (let i = 0; i < 200; i++) {
      const s = selectPair(pool, history, rng);
      expect(seen.has(s.id)).toBe(false);
      seen.add(s.id);
      for (const prior of lastEndpoints.slice(-5)) {
        expect(prior).not.toContain(s.a);
        expect(prior).not.toContain(s.b);
      }
      lastEndpoints.push([s.a, s.b]);
      history = s.history;
    }
  });
});

describe("guess by id", () => {
  it("accepts a picked suggestion and rejects ids outside the playing set", () => {
    expect(guessEntity(w, spainPoland(), id("FRA")).event.kind).toBe("accepted");
    expect(guessEntity(w, spainPoland(), "country:ZZZ").event.kind).toBe("not-recognized");
  });
});
