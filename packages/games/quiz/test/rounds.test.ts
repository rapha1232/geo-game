import { describe, expect, it } from "vitest";
import {
  MATCH_PAIRS,
  TILE_COUNT,
  TILE_CORRECT,
  allFound,
  buildQuizWorld,
  finishTiles,
  generateMatchRound,
  generateTileRound,
  matchScore,
  pickMatch,
  tileScore,
  toggleTile,
  type MatchRound,
  type QuizEntity,
} from "../src";
import { bigWorld } from "./helpers";

// 197 sovereign countries; every fifth one is landlocked.
const base = bigWorld();
const world = buildQuizWorld(
  base.entities.map((e, i): QuizEntity => ({ ...e, landlocked: i % 5 === 0 })),
);
const landlocked = new Set(world.entities.filter((e) => e.landlocked).map((e) => e.id));

describe("TILE_SELECT", () => {
  it("builds 24 distinct tiles with 9 matching ones", () => {
    const r = generateTileRound(world, { kind: "landlocked" }, "TILESEED01");
    expect(r.tiles).toHaveLength(TILE_COUNT);
    expect(new Set(r.tiles).size).toBe(TILE_COUNT);
    expect(r.correct).toHaveLength(TILE_CORRECT);
    for (const id of r.correct) expect(landlocked.has(id)).toBe(true);
    for (const id of r.tiles.filter((t) => !r.correct.includes(t)))
      expect(landlocked.has(id)).toBe(false);
  });

  it("works for a continent and is deterministic for a seed", () => {
    const a = generateTileRound(world, { kind: "continent", id: "AF" }, "TILESEED02");
    const b = generateTileRound(world, { kind: "continent", id: "AF" }, "TILESEED02");
    expect(a).toEqual(b);
    for (const id of a.correct) expect(world.byId.get(id)?.continent).toBe("AF");
    expect(
      generateTileRound(world, { kind: "continent", id: "AF" }, "TILESEED03").tiles,
    ).not.toEqual(a.tiles);
  });

  it("scores (right − wrong) ÷ matching, at least 0", () => {
    let r = generateTileRound(world, { kind: "landlocked" }, "TILESEED04");
    const wrong = r.tiles.filter((t) => !r.correct.includes(t));
    for (const id of r.correct.slice(0, 6)) r = toggleTile(r, id);
    expect(tileScore(r)).toBeCloseTo(6 / 9);
    r = toggleTile(r, wrong[0] as string);
    r = toggleTile(r, wrong[1] as string);
    expect(tileScore(r)).toBeCloseTo(4 / 9);
    for (const id of wrong.slice(2, 12)) r = toggleTile(r, id);
    expect(tileScore(r)).toBe(0);
  });

  it("a selected tile can be unselected, and finishing locks the round", () => {
    let r = generateTileRound(world, { kind: "landlocked" }, "TILESEED05");
    const id = r.correct[0] as string;
    r = toggleTile(toggleTile(r, id), id);
    expect(r.selected).toEqual([]);
    for (const c of r.correct) r = toggleTile(r, c);
    expect(allFound(r)).toBe(true);
    expect(tileScore(r)).toBe(1);
    r = finishTiles(r);
    expect(toggleTile(r, r.tiles.find((t) => !r.correct.includes(t)) as string)).toBe(r);
  });

  it("lives: each non-matching tile costs one and the last ends the round", () => {
    let r = generateTileRound(world, { kind: "landlocked" }, "TILESEED06", 3);
    const wrong = r.tiles.filter((t) => !r.correct.includes(t));
    r = toggleTile(r, r.correct[0] as string);
    expect(r.lives).toBe(3);
    r = toggleTile(r, wrong[0] as string);
    r = toggleTile(r, wrong[1] as string);
    expect(r.lives).toBe(1);
    r = toggleTile(r, wrong[2] as string);
    expect(r.lives).toBe(0);
    expect(r.status).toBe("lives_out");
  });
});

describe("MATCH", () => {
  const fresh = (): MatchRound => generateMatchRound(world, "MATCHSEED1");
  it("offers 8 countries on each side, each with its own capital", () => {
    const r = fresh();
    expect(r.left).toHaveLength(MATCH_PAIRS);
    expect([...r.left].sort()).toEqual([...r.right].sort());
    expect(generateMatchRound(world, "MATCHSEED1")).toEqual(r);
  });

  it("a right pair stays paired, a wrong one unpairs and counts a mistake", () => {
    let r = fresh();
    const [a, b] = r.left as [string, string];
    r = pickMatch(r, "left", a).round;
    const wrong = pickMatch(r, "right", b);
    expect(wrong.result).toBe("wrong");
    expect(wrong.round.pending).toBeNull();
    expect(wrong.round.mistakes).toBe(1);
    expect(wrong.round.matched).toEqual([]);
    const ok = pickMatch(pickMatch(wrong.round, "left", a).round, "right", a);
    expect(ok.result).toBe("paired");
    expect(ok.round.matched).toEqual([a]);
  });

  it("a right capital with no country chosen is ignored", () => {
    const r = fresh();
    expect(pickMatch(r, "right", r.right[0] as string).result).toBe("ignored");
  });

  it("finishes when all 8 are paired; each mistake costs an eighth", () => {
    let r = fresh();
    r = pickMatch(
      pickMatch(r, "left", r.left[0] as string).round,
      "right",
      r.left[1] as string,
    ).round;
    expect(r.mistakes).toBe(1);
    for (const id of r.left) r = pickMatch(pickMatch(r, "left", id).round, "right", id).round;
    expect(r.status).toBe("done");
    expect(matchScore(r)).toBeCloseTo(7 / 8);
  });

  it("lives: a wrong pair costs one and none left ends the round", () => {
    let r = generateMatchRound(world, "MATCHSEED2", 1);
    r = pickMatch(
      pickMatch(r, "left", r.left[0] as string).round,
      "right",
      r.left[1] as string,
    ).round;
    expect(r.lives).toBe(0);
    expect(r.status).toBe("lives_out");
  });
});
