import { describe, expect, it } from "vitest";
import { makeRng } from "@meridian/game-kit";
import {
  answerFollowUp,
  announceGuess,
  feedback,
  followUp,
  formatDistance,
  giveUp,
  guessEntity,
  hintContent,
  maxGuesses,
  openHint,
  proximityBar,
  repeatRules,
  roundPoints,
  selectChallenge,
  selectTarget,
  startRound,
  submitGuess,
  summarize,
  suggest,
  targetPool,
  describeShape,
  type RoundState,
} from "../src";
import {
  A1,
  A2,
  BRA,
  COD,
  ESP,
  FJI,
  FRA,
  GRC,
  KAZ,
  RUS,
  WSM,
  baseWorld,
  bigWorld,
  mk,
} from "./helpers";

const world = baseWorld();
const rng = () => makeRng("0123456789", "silhouette", {});
const start = (target = FRA.id, over: Partial<RoundState> = {}): RoundState => ({
  ...startRound(world, { targetId: target, mode: "unlimited", difficulty: "normal" }, rng()),
  ...over,
});

describe("feedback (AC-SH-001..004)", () => {
  it("AC-SH-001/002: France → Spain is 865 km to the south-west (214.7°)", () => {
    const f = feedback(FRA, ESP, false);
    expect(f.distanceKm).toBe(865);
    expect(f.bearing).toBe(215);
    expect(f.sector).toBe("SW");
    expect(f.proximity).toBe(95);
  });
  it("AC-SH-001/004: Brazil → France is 8,651 km, north-east, 56%", () => {
    const f = feedback(BRA, FRA, false);
    expect(f.distanceKm).toBe(8651);
    expect(f.sector).toBe("NE");
    expect(f.proximity).toBe(56);
  });
  it("AC-SH-003: Fiji → Samoa crosses the antimeridian eastward: 1,148 km, NE, 94%", () => {
    const f = feedback(FJI, WSM, false);
    expect(f.distanceKm).toBe(1148);
    expect(f.sector).toBe("NE");
    expect(f.proximity).toBe(94);
  });
  it("AC-SH-004: antipodal is 0% and east, and a correct guess is 100% at 0 km", () => {
    const f = feedback(A1, A2, false);
    expect(f.proximity).toBe(0);
    expect(f.sector).toBe("E");
    const ok = feedback(FRA, FRA, true);
    expect(ok).toMatchObject({ correct: true, distanceKm: 0, proximity: 100, sharesBorder: false });
  });
  it("identical ref points have no bearing", () => {
    const twin = mk("TWN", "Twin", [46.6, 2.5]);
    expect(feedback(twin, FRA, false)).toMatchObject({ bearing: null, sector: null });
  });
  it("distances format with grouping and convert to miles", () => {
    expect(formatDistance(8651, "km")).toBe("8,651");
    expect(formatDistance(1609.344, "mi")).toBe("1,000");
  });
  it("the proximity bar has 10 segments, one per 10% (floor)", () => {
    expect(proximityBar(56)).toBe("▰▰▰▰▰▱▱▱▱▱");
    expect(proximityBar(100)).toBe("▰".repeat(10));
  });
});

describe("guessing a round", () => {
  it("AC-SH-005: a neighbour whose ref point is far away still shows the border marker", () => {
    const r = guessEntity(world, start(RUS.id), KAZ.id);
    expect(r.event).toMatchObject({ kind: "accepted", row: { sharesBorder: true } });
    expect(r.state.guesses[0]?.distanceKm).toBeGreaterThan(1000);
  });
  it("AC-SH-006: unknown and repeated guesses consume nothing", () => {
    let s = start();
    let r = submitGuess(world, s, "Narnia");
    expect(r.event.kind).toBe("not-recognized");
    expect(r.state.guesses).toHaveLength(0);
    s = submitGuess(world, s, "Spain").state;
    r = submitGuess(world, s, "Spain");
    expect(r.event.kind).toBe("already-guessed");
    expect(r.state.guesses).toHaveLength(1);
    expect(submitGuess(world, s, "   ").event.kind).toBe("ignored");
  });
  it("AC-SH-007: a territory is a valid guess in a sovereign pool", () => {
    const r = submitGuess(world, start(), "Greenland");
    expect(r.event).toMatchObject({ kind: "accepted", row: { entityId: "territory:GRL" } });
    expect(r.state.guesses[0]?.distanceKm).toBeGreaterThan(0);
  });
  it("AC-SH-008: 'Congo' shows the group message and does not count", () => {
    const r = submitGuess(world, start(), "Congo");
    expect(r.event).toMatchObject({ kind: "ambiguous" });
    expect(r.state.guesses).toHaveLength(0);
  });
  it("a typo is accepted by the fuzzy matcher with a spelling note", () => {
    const r = submitGuess(world, start(), "Phillipines");
    expect(r.event).toMatchObject({
      kind: "accepted",
      row: { entityId: "country:PHL", note: "spelling-corrected" },
    });
  });
  it("a correct guess solves the round and a sixth wrong guess fails it", () => {
    expect(submitGuess(world, start(), "france").state.status).toBe("solved");
    let s = start();
    const wrong = [ESP, BRA, FJI, WSM, KAZ, COD];
    for (const w of wrong) s = guessEntity(world, s, w.id).state;
    expect(s.status).toBe("failed");
    expect(submitGuess(world, s, "Greece").event.kind).toBe("round-over");
  });
  it("giving up fails the round", () => {
    expect(giveUp(start())).toMatchObject({ status: "failed", gaveUp: true });
  });
  it("Practice has unlimited guesses and scores nothing", () => {
    let s = start(FRA.id, { mode: "practice" });
    expect(maxGuesses(s)).toBeNull();
    for (const w of [ESP, BRA, FJI, WSM, KAZ, COD, GRC]) s = guessEntity(world, s, w.id).state;
    expect(s.status).toBe("guessing");
    expect(roundPoints(guessEntity(world, s, FRA.id).state)).toBe(0);
  });
  it("AC-SH-016: a round survives a JSON round trip and a reload with 4 guesses left", () => {
    let s = start();
    s = guessEntity(world, s, ESP.id).state;
    s = guessEntity(world, s, BRA.id).state;
    const restored = JSON.parse(JSON.stringify(s)) as RoundState;
    expect(restored).toEqual(s);
    expect(restored.targetId).toBe(FRA.id);
    expect(restored.guesses).toHaveLength(2);
    expect(maxGuesses(restored)! - restored.guesses.length).toBe(4);
  });
  it("AC-SH-017: the Hard rotation is the same for the same seed, and 0 otherwise", () => {
    const hard = (seed: string) =>
      startRound(
        world,
        { targetId: FRA.id, mode: "unlimited", difficulty: "hard" },
        makeRng(seed, "silhouette", {}),
      ).rotation;
    expect(hard("AAAAAAAAAA")).toBe(hard("AAAAAAAAAA"));
    const angles = new Set(
      ["AAAAAAAAAA", "BBBBBBBBBB", "CCCCCCCCCC", "DDDDDDDDDD", "EEEEEEEEEE"].map(hard),
    );
    expect(angles.size).toBeGreaterThan(1);
    expect([...angles].every((a) => a >= 0 && a < 360)).toBe(true);
    expect(start().rotation).toBe(0);
  });
  it("AC-SH-018: the announcement has the name, distance, direction word, percent and border status", () => {
    const row = guessEntity(world, start(RUS.id), KAZ.id).state.guesses[0]!;
    const text = announceGuess(row, "Kazakhstan", 1, 6, "km");
    expect(text).toMatch(/^Guess 1 of 6: Kazakhstan\./);
    expect(text).toMatch(/kilometres/);
    expect(text).toMatch(/(north|south|east|west)/);
    expect(text).toMatch(/\d+ percent/);
    expect(text).toMatch(/Shares a border\.$/);
    expect(announceGuess({ ...row, sharesBorder: false }, "Kazakhstan", 2, 6, "mi")).toMatch(
      /miles.*percent\.$/,
    );
  });
});

describe("suggestions (AC-SH-020)", () => {
  it("'gre' suggests Greece, Greenland and Grenada, never filtered to the pool", () => {
    expect(suggest(world, "gre").map((e) => e.name)).toEqual(["Greece", "Greenland", "Grenada"]);
    expect(suggest(world, "")).toEqual([]);
  });
  it("ranks canonical-name prefixes before aliases and caps at 6", () => {
    const w = bigWorld();
    expect(suggest(w, "l").length).toBe(6);
    expect(
      suggest(world, "con")
        .map((e) => e.id)
        .sort(),
    ).toEqual([COD.id, "country:COG"].sort());
  });
});

describe("hints and scoring", () => {
  it("hint contents follow the ladder", () => {
    expect(hintContent(world, FRA.id, 1)).toMatchObject({ hint: 1, areaKm2: 640679 });
    expect(hintContent(world, FRA.id, 2)).toEqual({ hint: 2, continent: "EU" });
    expect(hintContent(world, FRA.id, 3)).toMatchObject({ kind: "remote" });
    expect(hintContent(world, RUS.id, 3)).toEqual({ hint: 3, kind: "neighbors", count: 1 });
    expect(hintContent(world, FRA.id, 4)).toEqual({ hint: 4, letter: "F" });
  });
  it("opening a hint twice, or after the round, is a no-op", () => {
    const s = openHint(start(), 2);
    expect(openHint(s, 2)).toBe(s);
    expect(openHint({ ...s, status: "solved" }, 4)).toEqual({ ...s, status: "solved" });
  });
  it("AC-SH-011: solved in 3 guesses with 1 hint and 1 correct follow-up is 4 points", () => {
    let s = openHint(start(), 1);
    s = guessEntity(world, s, ESP.id).state;
    s = guessEntity(world, s, BRA.id).state;
    s = guessEntity(world, s, FRA.id).state;
    expect(roundPoints(s, 1)).toBe(4);
    expect(roundPoints(s, 0)).toBe(3);
  });
  it("first try with no hints is 6, the minimum for a solve is 1, and a failure is 0", () => {
    expect(roundPoints(guessEntity(world, start(), FRA.id).state)).toBe(6);
    let s = start();
    for (const h of [1, 2, 3, 4]) s = openHint(s, h);
    for (const w of [ESP, BRA, FJI, WSM, KAZ]) s = guessEntity(world, s, w.id).state;
    expect(roundPoints(guessEntity(world, s, FRA.id).state)).toBe(1);
    expect(roundPoints({ ...s, status: "failed" })).toBe(0);
  });
  it("Hard doubles the hint cost and Easy gives the continent free", () => {
    let hard = startRound(
      world,
      { targetId: FRA.id, mode: "unlimited", difficulty: "hard" },
      rng(),
    );
    hard = openHint(hard, 1);
    expect(roundPoints(guessEntity(world, hard, FRA.id).state)).toBe(6 - 2);
    let easy = startRound(
      world,
      { targetId: FRA.id, mode: "unlimited", difficulty: "easy" },
      rng(),
    );
    easy = openHint(easy, 2);
    expect(easy.hints).toEqual([]);
    expect(roundPoints(guessEntity(world, easy, FRA.id).state)).toBe(6);
  });
  it("summarizes a session without Practice rounds", () => {
    const solved = guessEntity(world, start(), FRA.id).state;
    const failed = giveUp(start());
    const practice = guessEntity(world, start(FRA.id, { mode: "practice" }), FRA.id).state;
    const out = summarize([
      { state: solved, followUpsCorrect: 1 },
      { state: failed, followUpsCorrect: 0 },
      { state: practice, followUpsCorrect: 0 },
    ]);
    expect(out).toEqual({ points: 7, rounds: 2, solved: 1, solveRate: 0.5, averageGuesses: 1 });
  });
});

describe("target selection (silhouette §11)", () => {
  const big = bigWorld();
  const pool = targetPool(big, { kind: "sovereign-197" }, "normal");

  it("the default pool has 197 targets", () => {
    expect(pool).toHaveLength(197);
  });
  it("AC-SH-012: 98 consecutive rounds give 98 distinct targets", () => {
    const r = makeRng("ABCDEFGHJK", "silhouette", {});
    let history: readonly string[] = [];
    const seen: string[] = [];
    for (let i = 0; i < 98; i++) {
      const s = selectTarget(big, pool, "normal", history, r);
      seen.push(s.id);
      history = s.history;
    }
    expect(new Set(seen).size).toBe(98);
  });
  it("AC-SH-013: over 1,000 rounds no entity under 5,000 km² appears twice within 7 rounds", () => {
    const r = makeRng("KJHGFEDCBA", "silhouette", {});
    let history: readonly string[] = [];
    const ids: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const s = selectTarget(big, pool, "normal", history, r);
      ids.push(s.id);
      history = s.history;
    }
    const small = (id: string) => (big.byId.get(id)?.areaKm2 ?? Infinity) < 5000;
    expect(ids.some(small)).toBe(true);
    for (let i = 0; i < ids.length; i++)
      if (small(ids[i]!))
        for (let j = i + 1; j < Math.min(ids.length, i + 7); j++) expect(ids[j]).not.toBe(ids[i]);
  });
  it("a pool the extra small-entity window would empty relaxes instead of failing", () => {
    const tiny = pool.filter((id) => (big.byId.get(id)?.areaKm2 ?? Infinity) < 5000).slice(0, 4);
    const r = makeRng("ABABABABAB", "silhouette", {});
    let history: readonly string[] = [];
    let relaxed = false;
    for (let i = 0; i < 12; i++) {
      const s = selectTarget(big, tiny, "normal", history, r);
      expect(tiny).toContain(s.id);
      relaxed ||= s.guardRelaxed;
      history = s.history;
    }
    expect(relaxed).toBe(true);
  });
  it("Easy keeps only shapes under 0.45, and territories join the optional pool", () => {
    const easy = targetPool(big, { kind: "sovereign-197" }, "easy");
    expect(easy.length).toBeLessThan(pool.length);
    expect(easy.every((id) => (big.byId.get(id)?.shape ?? 1) < 0.45)).toBe(true);
    expect(targetPool(world, { kind: "sovereign+territories" }, "normal")).toContain(
      "territory:GRL",
    );
    expect(targetPool(world, { kind: "sovereign-197" }, "normal")).not.toContain("territory:GRL");
  });
  it("Hard weights small entities ×2 and Normal does not", () => {
    expect(repeatRules(big, "hard").downWeight).toHaveLength(2);
    expect(repeatRules(big, "normal").downWeight).toHaveLength(1);
  });
  it("a seeded challenge is identical for everyone and has no repeats", () => {
    const a = selectChallenge(big, pool, "normal", 10, makeRng("CHALLENGE1", "silhouette", {}));
    const b = selectChallenge(big, pool, "normal", 10, makeRng("CHALLENGE1", "silhouette", {}));
    expect(a.ids).toEqual(b.ids);
    expect(new Set(a.ids).size).toBe(10);
  });
});

describe("follow-ups (silhouette §8.2)", () => {
  const big = bigWorld();
  const target = big.entities[3]!.id;
  it("a capital question has four distinct options, one correct, mostly from the same continent", () => {
    const f = followUp(big, "capital", target, rng());
    expect(new Set(f.options).size).toBe(4);
    expect(f.options[f.correctIndex]).toBe(big.byId.get(target)!.capitals[0]);
    expect(answerFollowUp(f, f.correctIndex)).toBe(true);
    expect(answerFollowUp(f, (f.correctIndex + 1) % 4)).toBe(false);
    const cont = big.byId.get(target)!.continent;
    const near = f.options.filter(
      (o) => big.entities.find((e) => e.capitals[0] === o)?.continent === cont,
    );
    expect(near).toHaveLength(4);
  });
  it("a flag question puts confusable flags first and is deterministic for a seed", () => {
    const withConf = bigWorld();
    const t = withConf.entities[0]!;
    const conf = [withConf.entities[1]!.id, withConf.entities[2]!.id];
    const w2 = { ...withConf, byId: new Map(withConf.byId).set(t.id, { ...t, confusables: conf }) };
    const f = followUp(w2, "flag", t.id, rng());
    expect(f.options).toEqual(expect.arrayContaining([t.id, ...conf]));
    expect(followUp(w2, "flag", t.id, rng())).toEqual(f);
  });
});

describe("describeShape", () => {
  it("describes without naming the shape", () => {
    expect(describeShape({ aspect: 1, remoteParts: 2 })).toBe(
      "Shape: compact, roughly as wide as it is tall, 2 remote parts.",
    );
    expect(describeShape({ aspect: 0.3, remoteParts: 0 })).toBe(
      "Shape: long and narrow, no remote parts.",
    );
  });
});
