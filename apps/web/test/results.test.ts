import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { gameResult, ulid as ulidSchema } from "@meridian/schemas";
import { MeridianDb, type MasteryRecord } from "../lib/storage/db";
import { ulid } from "../lib/results/ulid";
import { masteryUpdates, silhouetteResult } from "../lib/results/silhouette";
import { loadHistory, loadMastery, saveRound } from "../lib/results/save";
import {
  bandOf,
  formatDuration,
  history,
  masteryByEntity,
  overview,
  perGame,
} from "../lib/results/stats";
import {
  DEFAULT_CONFIG,
  answer,
  guess,
  newSession,
  restore,
  setClock,
  surrender,
  type Session,
} from "../lib/silhouette/controller";
import { world } from "./fixtures/mini-world";

const T0 = Date.parse("2026-11-05T08:00:00Z");
const solveRound = (seed: string, now = T0): Session => {
  let s = newSession(world, seed, DEFAULT_CONFIG, [], now);
  s = guess(world, s, world.byId.get(s.round.targetId)!.name, now + 20_000);
  s = answer(s, 0, s.followUps[0]!.prompt.correctIndex);
  s = answer(s, 1, (s.followUps[1]!.prompt.correctIndex + 1) % 4);
  return s;
};

describe("ulid", () => {
  it("is 26 Crockford characters, sortable by time", () => {
    const a = ulid(T0, new Uint8Array(16));
    const b = ulid(T0 + 1000, new Uint8Array(16));
    expect(ulidSchema.safeParse(a).success).toBe(true);
    expect(a < b).toBe(true);
  });
});

describe("the round clock", () => {
  it("counts only visible time and stays paused after a reload", () => {
    let s = newSession(world, "AAAAAAAAAA", DEFAULT_CONFIG, [], T0);
    s = setClock(s, false, T0 + 10_000);
    expect(s.timer.elapsedMs).toBe(10_000);
    s = setClock(s, true, T0 + 100_000);
    s = setClock(s, false, T0 + 105_000);
    expect(s.timer.elapsedMs).toBe(15_000);
    const back = restore(JSON.parse(JSON.stringify(s)) as Session);
    expect(back.timer).toEqual({ elapsedMs: 15_000, runningSince: null });
    expect(back.resumed).toBe(true);
  });
  it("stops when the round ends", () => {
    const s = solveRound("BBBBBBBBBB");
    expect(s.timer.runningSince).toBeNull();
    expect(s.timer.elapsedMs).toBe(20_000);
  });
});

describe("silhouetteResult", () => {
  it("builds a valid GameResult for a solved round (DATA_MODEL §2.9)", () => {
    const s = solveRound("CCCCCCCCCC");
    const r = silhouetteResult(s, {
      id: ulid(T0, new Uint8Array(16)),
      contentVersion: "2026.10.0",
      endedAt: T0 + 30_000,
    });
    expect(gameResult.safeParse(r).success).toBe(true);
    expect(r).toMatchObject({
      game_id: "silhouette",
      mode: "unlimited",
      outcome: "solved",
      score: 7,
      max_score: 8,
      active_ms: 20_000,
      flags: { resumed: false, guardRelaxed: false, attempt: 1 },
    });
    expect(r.items.map((i) => i.item_id)).toEqual(["target", "followup:capital", "followup:flag"]);
    expect(r.items[0]).toMatchObject({ status: "correct", attempts: 1, hints: 0, points: 6 });
    expect(r.items.map((i) => i.status)).toEqual(["correct", "correct", "wrong"]);
    expect(r.meta?.guesses).toHaveLength(1);
  });
  it("records a give-up as gave_up with zero points", () => {
    let s = newSession(world, "DDDDDDDDDD", { ...DEFAULT_CONFIG, followUps: [] }, [], T0);
    s = surrender(world, s, T0 + 5000);
    const r = silhouetteResult(s, {
      id: ulid(T0, new Uint8Array(16)),
      contentVersion: "2026.10.0",
      endedAt: T0 + 6000,
    });
    expect(r).toMatchObject({ outcome: "gave_up", score: 0, max_score: 6 });
  });
});

describe("mastery", () => {
  it("moves shape mastery from 0.5 toward the item score and sets a due date", () => {
    const s = solveRound("EEEEEEEEEE");
    const ups = masteryUpdates(s, new Map(), T0);
    const shape = ups.find((u) => u.skill === "shape")!;
    expect(shape.mastery).toBeCloseTo(0.7 * 0.5 + 0.3 * 1);
    expect(shape.exposures).toBe(1);
    expect(Date.parse(shape.due_at)).toBeGreaterThan(T0);
    expect(ups.map((u) => u.skill).sort()).toEqual(["capital", "flag", "shape"]);
    const flag = ups.find((u) => u.skill === "flag")!;
    expect(flag.mastery).toBeCloseTo(0.35);
  });
  it("builds on the previous record, and Practice changes nothing", () => {
    const s = solveRound("FFFFFFFFFF");
    const first = masteryUpdates(s, new Map(), T0);
    const prev = new Map(
      first.map((u): [string, MasteryRecord] => [`${u.entity_id}|${u.skill}`, u]),
    );
    const second = masteryUpdates(s, prev, T0 + 86_400_000);
    expect(second.find((u) => u.skill === "shape")!.exposures).toBe(2);
    const practice = newSession(
      world,
      "GGGGGGGGGG",
      { ...DEFAULT_CONFIG, mode: "practice" },
      [],
      T0,
    );
    expect(masteryUpdates(guess(world, practice, "x", T0), new Map(), T0)).toEqual([]);
  });
});

describe("local saving (AC-PL-010)", () => {
  let db: MeridianDb;
  beforeEach(async () => {
    db = new MeridianDb(`results-${Math.random()}`);
    await db.open();
  });

  it("writes the result, mastery and history in one go, and is idempotent on the result id", async () => {
    const s = solveRound("HHHHHHHHHH");
    const result = silhouetteResult(s, {
      id: ulid(T0, new Uint8Array(16)),
      contentVersion: "2026.10.0",
      endedAt: T0 + 30_000,
    });
    const input = {
      result,
      mastery: masteryUpdates(s, new Map(), T0),
      history: { game_id: "silhouette", pool_key: "sovereign-197|normal", target_ids: s.history },
    };
    expect(await saveRound(db, input)).toBe(true);
    expect(await saveRound(db, input)).toBe(true);
    expect(await db.results.count()).toBe(1);
    expect(await db.mastery.count()).toBe(3);
    expect(await loadHistory(db, "silhouette", "sovereign-197|normal")).toEqual(s.history);
    const m = await loadMastery(db, [s.round.targetId]);
    expect(m.get(`${s.round.targetId}|shape`)?.exposures).toBe(1);
  });

  it("reports false instead of throwing when storage is blocked", async () => {
    db.close();
    const s = solveRound("NNNNNNNNNN");
    const result = silhouetteResult(s, {
      id: ulid(T0, new Uint8Array(16)),
      contentVersion: "2026.10.0",
      endedAt: T0 + 30_000,
    });
    await db.delete();
    const broken = new MeridianDb("never-opened");
    broken.close();
    expect(
      await saveRound(broken, {
        result,
        mastery: [],
        history: { game_id: "silhouette", pool_key: "k", target_ids: [] },
      }),
    ).toBe(false);
  });
});

describe("statistics (UX_AND_DESIGN §7.1)", () => {
  const mkResult = (i: number, over: Partial<ReturnType<typeof silhouetteResult>> = {}) => {
    const s = solveRound(`J${String(i).padStart(9, "0")}`, T0 + i * 3_600_000);
    return {
      ...silhouetteResult(s, {
        id: ulid(T0 + i, new Uint8Array(16).fill(i)),
        contentVersion: "2026.10.0",
        endedAt: T0 + i * 3_600_000 + 30_000,
      }),
      ...over,
    };
  };
  const rs = Array.from({ length: 30 }, (_, i) => mkResult(i));

  it("overview counts rounds, active days, time and games, ignoring Practice", () => {
    const practice = { ...mkResult(40), mode: "practice" as const };
    const o = overview([...rs, practice]);
    expect(o.rounds).toBe(30);
    expect(o.activeDays).toBe(2);
    expect(o.gamesTried).toBe(1);
    expect(o.activeMs).toBe(30 * 20_000);
    expect(overview([...rs], 600).activeDays).toBeGreaterThanOrEqual(2);
  });
  it("per-game stats: rate, average and best score, average guesses, and a 20-round trend", () => {
    const [g] = perGame(rs);
    expect(g).toMatchObject({
      gameId: "silhouette",
      rounds: 30,
      solved: 30,
      solveRate: 1,
      bestScore: 7,
      averageGuesses: 1,
    });
    expect(g!.trend).toHaveLength(20);
    expect(perGame([])).toEqual([]);
  });
  it("history is newest first, capped at 200 and filterable", () => {
    const failed = { ...mkResult(50), outcome: "failed" as const, score: 0 };
    const list = history([...rs, failed]);
    expect(list[0]!.id).toBe(failed.id);
    expect(history([...rs, failed], { outcome: "failed" })).toHaveLength(1);
    expect(history([...rs, failed], { gameId: "quiz" })).toEqual([]);
    expect(history(Array.from({ length: 250 }, (_, i) => mkResult(i % 30)))).toHaveLength(200);
  });
  it("mastery bands and the per-entity mean over skills", () => {
    expect([0.9, 0.7, 0.3].map(bandOf)).toEqual(["strong", "learning", "weak"]);
    const rows = [
      { entity_id: "country:FRA", skill: "shape", mastery: 0.9 },
      { entity_id: "country:FRA", skill: "capital", mastery: 0.5 },
      { entity_id: "country:ESP", skill: "ignored", mastery: 1 },
    ] as MasteryRecord[];
    const m = masteryByEntity(rows);
    expect(m.get("country:FRA")).toEqual({ mean: 0.7, skills: 2 });
    expect(m.has("country:ESP")).toBe(false);
  });
  it("formats durations", () => {
    expect([42_000, 180_000, 3_900_000].map(formatDuration)).toEqual([
      "42 s",
      "3 min",
      "1 h 05 min",
    ]);
  });
});
