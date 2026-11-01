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

import {
  FIND_ATTEMPTS,
  clickSub,
  currentPrompt,
  giveUpSub,
  newFind,
  newNameAll,
  subIndex,
  subScore,
  submitName,
  type SubItem,
} from "../src";

describe("subdivision quizzes", () => {
  const items: SubItem[] = [
    { id: "subdivision:US-CA", name: "California", aliases: [{ text: "CA", kind: "code" }] },
    { id: "subdivision:US-NY", name: "New York", aliases: [{ text: "NY", kind: "code" }] },
    { id: "subdivision:US-VA", name: "Virginia", aliases: [] },
    { id: "subdivision:US-WV", name: "West Virginia", aliases: [] },
  ];
  const index = subIndex(items);

  it("Name them all: exact names count, repeats do not, and naming all ends it", () => {
    let r = newNameAll("USA", items);
    r = submitName(r, index, "california", false).round;
    expect(r.found).toEqual(["subdivision:US-CA"]);
    expect(submitName(r, index, "california", true).event.kind).toBe("already");
    expect(submitName(r, index, "narnia", true).event.kind).toBe("not-recognized");
    r = submitName(r, index, "NY", true).round;
    r = submitName(r, index, "west virginia", true).round;
    r = submitName(r, index, "virginia", true).round;
    expect(r.status).toBe("done");
    expect(subScore(r)).toBe(100);
  });

  it("holds while the typed name could still become a longer one (Niger / Nigeria)", () => {
    const two: SubItem[] = [
      { id: "subdivision:NG-NI", name: "Niger", aliases: [] },
      { id: "subdivision:NG-NA", name: "Nigeria Capital", aliases: [] },
    ];
    expect(submitName(newNameAll("NGA", two), subIndex(two), "niger", false).event.kind).toBe(
      "hold",
    );
    expect(submitName(newNameAll("NGA", two), subIndex(two), "niger", true).event.kind).toBe(
      "accepted",
    );
  });

  it("Give up keeps what was found and scores it", () => {
    let r = submitName(newNameAll("USA", items), index, "new york", true).round;
    r = giveUpSub(r);
    expect(r.status).toBe("gave_up");
    expect(subScore(r)).toBe(25);
    expect(submitName(r, index, "california", true).event.kind).toBe("ignored");
  });

  it("Find it: the order is seeded; 1, 0.5 and 0.25 for the first, second and third try; the fourth miss moves on", () => {
    const a = newFind("USA", items, "SEED000001");
    expect(newFind("USA", items, "SEED000001")).toEqual(a);
    expect(a.order).toHaveLength(4);
    let r = a;
    const wrongFor = (target: string) => items.find((i) => i.id !== target)!.id;
    const t0 = currentPrompt(r)!;
    r = clickSub(r, t0).round;
    expect(r.scores[t0]).toBe(1);
    const t1 = currentPrompt(r)!;
    r = clickSub(r, wrongFor(t1)).round;
    r = clickSub(r, t1).round;
    expect(r.scores[t1]).toBe(0.5);
    const t2 = currentPrompt(r)!;
    r = clickSub(r, wrongFor(t2)).round;
    r = clickSub(r, wrongFor(t2)).round;
    r = clickSub(r, t2).round;
    expect(r.scores[t2]).toBe(0.25);
    const t3 = currentPrompt(r)!;
    for (let i = 0; i < FIND_ATTEMPTS - 1; i++) r = clickSub(r, wrongFor(t3)).round;
    const last = clickSub(r, wrongFor(t3));
    expect(last.event).toEqual({ kind: "missed", answer: t3 });
    expect(last.round.status).toBe("done");
    expect(subScore(last.round)).toBe(Math.round((100 * 1.75) / 4));
  });
});

describe("subdivision codes", () => {
  const items: SubItem[] = [
    { id: "subdivision:US-NE", name: "Nebraska", aliases: [{ text: "NE", kind: "code" }] },
    { id: "subdivision:US-NY", name: "New York", aliases: [{ text: "NY", kind: "code" }] },
  ];
  it('a postal code counts on Enter but not while typing, so New York is not cut short at "ne"', () => {
    const idx = subIndex(items);
    expect(submitName(newNameAll("USA", items), idx, "ne", false).event.kind).toBe(
      "not-recognized",
    );
    expect(submitName(newNameAll("USA", items), idx, "ne", true).event.kind).toBe("accepted");
  });
});
