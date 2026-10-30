import type { GameResult } from "@meridian/schemas";
import type { MasteryRecord } from "../storage/db";

export const SKILLS = ["recall", "locate", "flag", "capital", "shape"] as const;
export const HISTORY_LIMIT = 200;
export const TREND_LENGTH = 20;

export type GameStats = {
  gameId: string;
  rounds: number;
  solved: number;
  solveRate: number;
  averageScore: number;
  bestScore: number;
  /** Average guesses on solved rounds (Silhouette). */
  averageGuesses: number | null;
  /** Scores of the last 20 rounds, oldest first. */
  trend: number[];
};

export type Overview = {
  rounds: number;
  activeDays: number;
  activeMs: number;
  gamesTried: number;
};

/** Practice is unscored, so it stays out of every statistic (silhouette §3). */
const counted = (r: GameResult): boolean => r.mode !== "practice";
const dayOf = (iso: string, offsetMinutes: number): string =>
  new Date(Date.parse(iso) + offsetMinutes * 60_000).toISOString().slice(0, 10);

/** `offsetMinutes` is the player's UTC offset, so "active days" follow their calendar. */
export function overview(results: readonly GameResult[], offsetMinutes = 0): Overview {
  const rs = results.filter(counted);
  return {
    rounds: rs.length,
    activeDays: new Set(rs.map((r) => dayOf(r.ended_at, offsetMinutes))).size,
    activeMs: rs.reduce((s, r) => s + r.active_ms, 0),
    gamesTried: new Set(rs.map((r) => r.game_id)).size,
  };
}

export function perGame(results: readonly GameResult[]): GameStats[] {
  const by = new Map<string, GameResult[]>();
  for (const r of results.filter(counted))
    (by.get(r.game_id) ?? by.set(r.game_id, []).get(r.game_id)!).push(r);
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([gameId, list]) => {
      const sorted = [...list].sort((a, b) => a.ended_at.localeCompare(b.ended_at));
      const solved = sorted.filter((r) => r.outcome === "solved" || r.outcome === "completed");
      const targetAttempts = solved
        .map((r) => r.items.find((i) => i.item_id === "target")?.attempts)
        .filter((n): n is number => typeof n === "number");
      return {
        gameId,
        rounds: sorted.length,
        solved: solved.length,
        solveRate: solved.length / sorted.length,
        averageScore: sorted.reduce((s, r) => s + r.score, 0) / sorted.length,
        bestScore: Math.max(...sorted.map((r) => r.score)),
        averageGuesses: targetAttempts.length
          ? targetAttempts.reduce((s, n) => s + n, 0) / targetAttempts.length
          : null,
        trend: sorted.slice(-TREND_LENGTH).map((r) => r.score),
      };
    });
}

export type HistoryFilter = { gameId?: string; outcome?: GameResult["outcome"] };

/** The last 200 results, newest first, optionally filtered. */
export function history(results: readonly GameResult[], filter: HistoryFilter = {}): GameResult[] {
  return results
    .filter(
      (r) =>
        (!filter.gameId || r.game_id === filter.gameId) &&
        (!filter.outcome || r.outcome === filter.outcome),
    )
    .sort((a, b) => b.ended_at.localeCompare(a.ended_at))
    .slice(0, HISTORY_LIMIT);
}

export type MasteryBand = "strong" | "learning" | "weak";
export const bandOf = (mean: number): MasteryBand =>
  mean >= 0.8 ? "strong" : mean >= 0.6 ? "learning" : "weak";

/** Mean mastery per entity across the skills it has been tested on. Entities never played are absent. */
export function masteryByEntity(
  rows: readonly MasteryRecord[],
): Map<string, { mean: number; skills: number }> {
  const sums = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (!(SKILLS as readonly string[]).includes(r.skill)) continue;
    const cur = sums.get(r.entity_id) ?? { sum: 0, n: 0 };
    cur.sum += r.mastery;
    cur.n += 1;
    sums.set(r.entity_id, cur);
  }
  return new Map([...sums].map(([id, v]) => [id, { mean: v.sum / v.n, skills: v.n }]));
}

/** Rounded to whole minutes, or seconds under a minute: "1 h 05 min", "3 min", "42 s". */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
