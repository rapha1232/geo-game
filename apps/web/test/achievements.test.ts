import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { gameResult, type GameResult } from "@meridian/schemas";
import { MeridianDb } from "../lib/storage/db";
import { ACHIEVEMENTS, evaluate, masteryAverage } from "../lib/achievements/defs";
import { checkAchievements, onUnlock, watchResults } from "../lib/achievements/engine";
import { computeStreak } from "../lib/achievements/streak";
import { exportData, importData, parseExport, deleteAll } from "../lib/settings/data";
import { DEFAULT_SETTINGS, sanitize } from "../lib/settings/settings";
import { randomUlid } from "../lib/results/ulid";

let n = 0;
const result = (over: Record<string, unknown> = {}): GameResult => {
  n++;
  const ended = new Date(Date.UTC(2026, 10, 1, 12, n)).toISOString();
  return gameResult.parse({
    id: randomUlid(Date.UTC(2026, 10, 1, 12, n)),
    game_id: "silhouette",
    mode: "unlimited",
    config: {},
    config_hash: "h",
    seed: "SEED000001",
    content_version: "2026.10.0",
    score: 5,
    max_score: 8,
    outcome: "solved",
    items: [{ item_id: "target", status: "correct", attempts: 3 }],
    flags: { resumed: false, pauseCount: 0, assisted: false, guardRelaxed: false, attempt: 1 },
    started_at: ended,
    ended_at: ended,
    active_ms: 1000,
    ...over,
  });
};
const store = (db: MeridianDb, r: GameResult) =>
  db.results.put({ id: r.id, game_id: r.game_id, ended_at: r.ended_at, data: r });
const ids = (rs: GameResult[], m = []) => evaluate(rs, m).map((e) => e.id);
const fresh = () => new MeridianDb(`ach-${Math.random()}`);

describe("achievements", () => {
  it("AC-PL-032 a first-guess Silhouette solve unlocks First Look straight after the result is stored", async () => {
    const db = fresh();
    watchResults(db);
    const seen: string[] = [];
    const off = onUnlock((list) => seen.push(...list.map((a) => a.id)));
    await store(db, result({ items: [{ item_id: "target", status: "correct", attempts: 1 }] }));
    await new Promise((r) => setTimeout(r, 50));
    off();
    expect(seen).toEqual(["ACH-SH-FIRST"]);
    expect((await db.achievements.toArray()).map((a) => a.id)).toEqual(["ACH-SH-FIRST"]);
  });

  it("writes an unlock once, however often it is checked", async () => {
    const db = fresh();
    await store(db, result({ items: [{ item_id: "target", status: "correct", attempts: 1 }] }));
    const [a, b] = await Promise.all([checkAchievements(db), checkAchievements(db)]);
    expect(a.length + b.length).toBe(1);
    expect(await db.achievements.count()).toBe(1);
  });

  it("does not count practice or learn rounds", () => {
    const practice = result({
      mode: "practice",
      items: [{ item_id: "t", status: "correct", attempts: 1 }],
    });
    expect(ids([practice])).toEqual([]);
  });

  it("counts solved rounds up to 10 and 50", () => {
    const nine = Array.from({ length: 9 }, () => result());
    expect(ids(nine)).not.toContain("ACH-SH-10");
    expect(ids([...nine, result()])).toContain("ACH-SH-10");
    expect(ids(Array.from({ length: 50 }, () => result()))).toContain("ACH-SH-50");
  });

  it("recognises perfect scores in each game", () => {
    expect(ids([result({ game_id: "border-run", score: 10, max_score: 10 })])).toEqual(
      expect.arrayContaining(["ACH-BR-FIRST", "ACH-BR-PERFECT"]),
    );
    expect(ids([result({ game_id: "border-run", score: 8, max_score: 10 })])).not.toContain(
      "ACH-BR-PERFECT",
    );
    expect(
      ids([
        result({
          game_id: "rank-it",
          config: { format: "order" },
          score: 100,
          max_score: 100,
          outcome: "completed",
        }),
      ]),
    ).toContain("ACH-RK-ORDER");
    expect(
      ids([
        result({
          game_id: "rank-it",
          config: { format: "higher-lower" },
          score: 10,
          max_score: 10,
          outcome: "completed",
        }),
      ]),
    ).toContain("ACH-RK-ROLL");
    expect(
      ids([
        result({
          game_id: "rank-it",
          config: { format: "higher-lower" },
          score: 9,
          max_score: 9,
          outcome: "completed",
        }),
      ]),
    ).not.toContain("ACH-RK-ROLL");
    expect(
      ids([
        result({ game_id: "quiz", mode: "timed", score: 20, max_score: 20, outcome: "completed" }),
      ]),
    ).toEqual(expect.arrayContaining(["ACH-QZ-FIRST", "ACH-QZ-PERFECT"]));
  });

  it("Explorer needs all five games", () => {
    const games = ["quiz", "silhouette", "fact-pin", "border-run"];
    const rs = games.map((g) => result({ game_id: g, outcome: "completed" }));
    expect(ids(rs)).not.toContain("ACH-ALL-GAMES");
    expect(ids([...rs, result({ game_id: "rank-it", outcome: "completed" })])).toContain(
      "ACH-ALL-GAMES",
    );
  });

  it("Cartographer averages mastery over all 197 countries", () => {
    const m = Array.from({ length: 197 }, (_, i) => ({
      entity_id: `country:C${i}`,
      skill: "shape",
      mastery: 0.85,
      exposures: 3,
      last_seen_at: "",
      due_at: "",
    }));
    expect(masteryAverage(m)).toBeCloseTo(0.85);
    expect(evaluate([], m).map((e) => e.id)).toContain("ACH-MS-80");
    expect(evaluate([], m.slice(0, 100)).map((e) => e.id)).not.toContain("ACH-MS-80");
  });

  it("has unique ids", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it("survives export, import and delete", async () => {
    const a = fresh();
    await store(a, result({ items: [{ item_id: "t", status: "correct", attempts: 1 }] }));
    await checkAchievements(a);
    const file = parseExport(JSON.stringify(await exportData(a, Date.now())));
    expect(file.achievements).toHaveLength(1);
    const b = fresh();
    await importData(b, file);
    expect(await b.achievements.count()).toBe(1);
    await deleteAll(b);
    expect(await b.achievements.count()).toBe(0);
  });
});

describe("streaks", () => {
  it("AC-PL-031 are off by default", () => {
    expect(DEFAULT_SETTINGS.streaks).toBe(false);
    expect(sanitize({}).streaks).toBe(false);
    expect(sanitize({ streaks: true }).streaks).toBe(true);
  });

  it("count consecutive days and treat today as still open", () => {
    expect(computeStreak(["2026-11-01", "2026-11-02", "2026-11-03"], "2026-11-03").current).toBe(3);
    expect(computeStreak(["2026-11-01", "2026-11-02"], "2026-11-03").current).toBe(2);
    expect(computeStreak([], "2026-11-03")).toEqual({ current: 0, longest: 0, freezes: 2 });
  });

  it("a missed day uses a banked freeze and keeps the streak going", () => {
    const s = computeStreak(["2026-11-01", "2026-11-02", "2026-11-04"], "2026-11-04");
    expect(s.current).toBe(3);
    expect(s.freezes).toBe(1);
  });

  it("with no freeze left a miss starts the streak over, and the longest is kept", () => {
    const s = computeStreak(
      ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-07", "2026-11-08"],
      "2026-11-08",
    );
    expect(s.longest).toBe(3);
    expect(s.current).toBe(2);
  });

  it("banks two new freezes each 14-day period, never more than two", () => {
    const days = Array.from({ length: 15 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
    expect(computeStreak(days, "2026-11-15").freezes).toBe(2);
  });
});
