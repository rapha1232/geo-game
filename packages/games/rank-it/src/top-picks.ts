import type { Rng } from "@meridian/game-kit";
import {
  COMBO_WINDOW,
  candidatesFor,
  chooseStat,
  comboId,
  separationFactor,
  shuffle,
  statOfCombo,
} from "./generate";
import { separated } from "./stats";
import { GRID_SIZE, TOP_PICKS, type RankConfig, type RankWorld, type StatDef } from "./types";
import type { Generated } from "./order";

export const MAX_TOP_POINTS = 15;

export type TopPicksRound = {
  kind: "top-picks";
  stat: string;
  scope: string;
  /** The 16 entities, in grid order. */
  grid: string[];
  /** The top 5, highest first. */
  truth: string[];
  picks: string[];
  status: "picking" | "revealed";
};

/** 16 entities whose top six differ from each other by the separation threshold, so the top 5 is unambiguous. */
export function newTopPicks(
  w: RankWorld,
  config: RankConfig,
  history: readonly string[],
  rng: Rng,
): Generated<TopPicksRound> {
  const stat = chooseStat(w, config, history.map(statOfCombo), rng.fork("stat"));
  if (!stat) return null;
  const recent = new Set(history.slice(-COMBO_WINDOW));
  const factor = separationFactor(config.difficulty);
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = rng.fork(`attempt:${attempt}`);
    const pool = candidatesFor(w, stat.id, config.scope, config.difficulty, r.fork("pool"));
    if (pool.length < GRID_SIZE) continue;
    const chosen = shuffle(pool, r.fork("grid")).slice(0, GRID_SIZE);
    const sorted = [...chosen].sort((a, b) => b.value - a.value);
    if (!isUnambiguousTop(stat, sorted, factor)) continue;
    const combo = comboId(
      stat.id,
      chosen.map((c) => c.id),
    );
    if (recent.has(combo) && attempt < 39) continue;
    return {
      round: {
        kind: "top-picks",
        stat: stat.id,
        scope: config.scope,
        grid: chosen.map((c) => c.id),
        truth: sorted.slice(0, TOP_PICKS).map((c) => c.id),
        picks: [],
        status: "picking",
      },
      combo,
      history: [...history, combo].slice(-COMBO_WINDOW),
    };
  }
  return null;
}

function isUnambiguousTop(
  def: StatDef,
  sorted: readonly { value: number }[],
  factor: number,
): boolean {
  for (let i = 0; i < TOP_PICKS; i++)
    if (
      !separated(
        def,
        (sorted[i] as { value: number }).value,
        (sorted[i + 1] as { value: number }).value,
        factor,
      )
    )
      return false;
  return true;
}

/** Toggles a pick. Five picks fill the round; the player can take a pick back before revealing. */
export function togglePick(round: TopPicksRound, id: string): TopPicksRound {
  if (round.status !== "picking" || !round.grid.includes(id)) return round;
  if (round.picks.includes(id)) return { ...round, picks: round.picks.filter((p) => p !== id) };
  if (round.picks.length >= TOP_PICKS) return round;
  return { ...round, picks: [...round.picks, id] };
}

export const reveal = (round: TopPicksRound): TopPicksRound =>
  round.status === "picking" ? { ...round, status: "revealed" } : round;

/** Rank 1 is worth 5 points down to rank 5 worth 1; outside the top 5 is 0 (max 15). */
export function topPoints(round: TopPicksRound): number {
  return round.picks.reduce((sum, id) => {
    const rank = round.truth.indexOf(id);
    return sum + (rank === -1 ? 0 : TOP_PICKS - rank);
  }, 0);
}
