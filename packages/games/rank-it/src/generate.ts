import type { Rng } from "@meridian/game-kit";
import { ranked, separated } from "./stats";
import {
  GRID_SIZE,
  ORDER_SIZE,
  type Difficulty,
  type RankConfig,
  type RankWorld,
  type StatDef,
} from "./types";

export const shuffle = <T>(items: readonly T[], rng: Rng): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
};

export type Candidate = { id: string; value: number };

/** How much wider the separation threshold is on each difficulty (rank-it §6). Easy: ×3. */
export const separationFactor = (d: Difficulty): number => (d === "easy" ? 3 : 1);
export const EASY_FAMILIARITY = 0.6;
/** Hard draws every item from ±15 ranks around a centre. */
export const HARD_WINDOW = 31;

/** Random greedy pick of `count` candidates that all differ by the separation threshold. */
export function pickSeparated(
  def: StatDef,
  pool: readonly Candidate[],
  count: number,
  factor: number,
  rng: Rng,
): Candidate[] | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const chosen: Candidate[] = [];
    for (const c of shuffle(pool, rng)) {
      if (chosen.every((x) => separated(def, x.value, c.value, factor))) chosen.push(c);
      if (chosen.length === count) return chosen;
    }
  }
  return null;
}

/** Candidates for a round on a statistic: scoped, familiar enough on Easy, and a rank window on Hard. */
export function candidatesFor(
  w: RankWorld,
  stat: string,
  scope: string,
  difficulty: Difficulty,
  rng: Rng,
): Candidate[] {
  let list = ranked(w, stat, scope);
  if (difficulty === "easy")
    list = list.filter((c) => (w.byId.get(c.id)?.familiarity ?? 0) > EASY_FAMILIARITY);
  if (difficulty === "hard" && list.length > HARD_WINDOW) {
    const start = rng.nextInt(list.length - HARD_WINDOW + 1);
    list = list.slice(start, start + HARD_WINDOW);
  }
  return list;
}

/** Statistics a configuration can use: enough entities in scope to build the largest round of the format. */
export function usableStats(w: RankWorld, config: RankConfig): StatDef[] {
  const need = config.format === "top-picks" ? GRID_SIZE : ORDER_SIZE + 1;
  return w.stats.filter((s) => ranked(w, s.id, config.scope).length >= need);
}

/**
 * The statistic for a round. A fixed choice is used as is; `random` skips a statistic that already filled the last
 * two rounds (rank-it §11).
 */
export function chooseStat(
  w: RankWorld,
  config: RankConfig,
  recentStats: readonly string[],
  rng: Rng,
): StatDef | null {
  const usable = usableStats(w, config);
  if (config.stat !== "random") return usable.find((s) => s.id === config.stat) ?? null;
  const last2 = recentStats.slice(-2);
  const blocked = last2.length === 2 && last2[0] === last2[1] ? last2[0] : undefined;
  const options = usable.filter((s) => s.id !== blocked);
  const list = options.length > 0 ? options : usable;
  return list[rng.nextInt(list.length)] ?? null;
}

/** The identity of a round for the Repeat Guard: statistic plus the set of entities (rank-it §11). */
export const comboId = (stat: string, ids: readonly string[]): string =>
  `${stat}|${[...ids].sort().join(",")}`;
export const COMBO_WINDOW = 500;
export const statOfCombo = (combo: string): string => combo.slice(0, combo.indexOf("|"));
