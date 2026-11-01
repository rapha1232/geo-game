import { describe, expect, it } from "vitest";
import {
  buildQuizWorld,
  finishTiles,
  pickMatch,
  toggleTile,
  type QuizEntity,
} from "@meridian/quiz";
import {
  ROUND_QUIZZES,
  findRound,
  newRoundSession,
  roundPbKey,
  roundPoints,
  roundResult,
} from "../lib/quiz/rounds";
import { buildCatalog } from "../lib/catalog/catalog";
import { catalogKeyOf } from "../lib/catalog/store";

const continents = ["AF", "AS", "EU", "NA", "OC", "SA"];
const entities: QuizEntity[] = Array.from({ length: 197 }, (_, i) => ({
  id: `country:C${String(i).padStart(3, "0")}`,
  name: `Land ${i}`,
  aliases: [],
  type: "country",
  continent: continents[i % 6] as string,
  region: null,
  areaKm2: 1000,
  capitals: [{ name: `Capital ${i}`, role: "official" }],
  difficulty: {},
  sets: ["sovereign-197", "un-193"],
  landlocked: i % 5 === 0,
}));
const world = buildQuizWorld(entities);
const ctx = { id: "01J00000000000000000000000", contentVersion: "2026.10.0", endedAt: Date.now() };

describe("round quizzes", () => {
  it("lists a landlocked quiz, one per continent and a capital match", () => {
    expect(ROUND_QUIZZES.map((q) => q.slug)).toContain("landlocked-countries");
    expect(ROUND_QUIZZES.map((q) => q.slug)).toContain("pick-the-countries-of-north-america");
    expect(findRound("match-the-capitals")?.kind).toBe("match");
    expect(ROUND_QUIZZES).toHaveLength(8);
  });

  it("scores a tile round out of 100 and writes a valid result with its own personal-best bucket", () => {
    const quiz = findRound("landlocked-countries")!;
    let s = newRoundSession(world, quiz, "K7Q2M9XD1A", 3, 1000);
    expect(s.round.kind).toBe("tiles");
    if (s.round.kind !== "tiles") return;
    let r = s.round;
    for (const id of r.correct.slice(0, 6)) r = toggleTile(r, id);
    r = finishTiles(r);
    s = { ...s, round: r };
    expect(roundPoints(r)).toBe(67);
    const result = roundResult(s, ctx);
    expect(result.score).toBe(67);
    expect(result.max_score).toBe(100);
    expect(result.outcome).toBe("completed");
    expect(result.pb_key).toBe(roundPbKey("landlocked-countries", 3));
    expect(roundPbKey("landlocked-countries", undefined)).not.toBe(result.pb_key);
    expect(result.items.filter((i) => i.status === "missed")).toHaveLength(3);
  });

  it("records a lives-out round with that outcome", () => {
    const quiz = findRound("landlocked-countries")!;
    const s = newRoundSession(world, quiz, "K7Q2M9XD1B", 1, 1000);
    if (s.round.kind !== "tiles") throw new Error("expected tiles");
    const wrong = s.round.tiles.find(
      (t) => !(s.round as { correct: string[] }).correct.includes(t),
    )!;
    const after = { ...s, round: toggleTile(s.round, wrong) };
    expect(roundResult(after, ctx).outcome).toBe("lives_out");
  });

  it("a match round scores an eighth off per mistake", () => {
    const quiz = findRound("match-the-capitals")!;
    const s = newRoundSession(world, quiz, "K7Q2M9XD1C", undefined, 1000);
    if (s.round.kind !== "match") throw new Error("expected match");
    let r = s.round;
    r = pickMatch(
      pickMatch(r, "left", r.left[0] as string).round,
      "right",
      r.left[1] as string,
    ).round;
    for (const id of r.left) r = pickMatch(pickMatch(r, "left", id).round, "right", id).round;
    expect(roundPoints(r)).toBe(88);
    expect(roundResult({ ...s, round: r }, ctx).items).toHaveLength(8);
  });

  it("appear in the catalog and their results find their catalog entry", () => {
    const items = buildCatalog(null);
    expect(items.map((i) => i.key)).toContain("quiz:landlocked-countries");
    const quiz = findRound("match-the-capitals")!;
    const s = newRoundSession(world, quiz, "K7Q2M9XD1D", undefined, 1000);
    expect(catalogKeyOf(roundResult(s, ctx))).toBe("quiz:match-the-capitals");
  });
});
