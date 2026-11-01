import type { Rng } from "@meridian/game-kit";
import {
  COMBO_WINDOW,
  candidatesFor,
  chooseStat,
  comboId,
  pickSeparated,
  separationFactor,
  shuffle,
  statOfCombo,
} from "./generate";
import { ORDER_SIZE, type RankConfig, type RankWorld } from "./types";

export const HINT_PENALTY = 20;
export const PAIRS = (ORDER_SIZE * (ORDER_SIZE - 1)) / 2;

export type OrderRound = {
  kind: "order";
  stat: string;
  scope: string;
  /** Highest first: the correct answer. Kept in state so a reload restores the round exactly. */
  truth: string[];
  /** The player's current arrangement, top to bottom. */
  arrangement: string[];
  /** Position (0-based) of one item revealed by the hint. */
  hint: { id: string; position: number } | null;
  status: "arranging" | "revealed";
};

export type Generated<R> = { round: R; combo: string; history: string[] } | null;

/** Order round (rank-it §2): 5 entities that satisfy the separation rule, presented in a seeded shuffle. */
export function newOrderRound(
  w: RankWorld,
  config: RankConfig,
  history: readonly string[],
  rng: Rng,
): Generated<OrderRound> {
  const stat = chooseStat(w, config, history.map(statOfCombo), rng.fork("stat"));
  if (!stat) return null;
  const recent = new Set(history.slice(-COMBO_WINDOW));
  for (let attempt = 0; attempt < 30; attempt++) {
    const r = rng.fork(`attempt:${attempt}`);
    const pool = candidatesFor(w, stat.id, config.scope, config.difficulty, r.fork("pool"));
    const picked = pickSeparated(
      stat,
      pool,
      ORDER_SIZE,
      separationFactor(config.difficulty),
      r.fork("pick"),
    );
    if (!picked) continue;
    const combo = comboId(
      stat.id,
      picked.map((p) => p.id),
    );
    if (recent.has(combo) && attempt < 29) continue;
    const truth = [...picked].sort((a, b) => b.value - a.value).map((p) => p.id);
    let arrangement = shuffle(truth, r.fork("shuffle"));
    // A shuffle that happens to be correct would hand out 100 for doing nothing.
    if (arrangement.join() === truth.join()) arrangement = [...arrangement].reverse();
    return {
      round: {
        kind: "order",
        stat: stat.id,
        scope: config.scope,
        truth,
        arrangement,
        hint: null,
        status: "arranging",
      },
      combo,
      history: [...history, combo].slice(-COMBO_WINDOW),
    };
  }
  return null;
}

/** Moves the item at `from` to position `to` (drag, or the Move up/down buttons). */
export function move(round: OrderRound, from: number, to: number): OrderRound {
  if (round.status !== "arranging") return round;
  const n = round.arrangement.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return round;
  const next = [...round.arrangement];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as string);
  return { ...round, arrangement: next };
}

/** "Brazil, moved to position 2 of 5" (rank-it §5). */
export const announceMove = (name: string, position: number, total: number): string =>
  `${name}, moved to position ${position + 1} of ${total}`;

/**
 * Hint (once per round, −20 points): reveals the true position of the first item that is out of place now; when
 * everything is right, of the top item.
 */
export function useHint(round: OrderRound): OrderRound {
  if (round.status !== "arranging" || round.hint) return round;
  const wrong = round.arrangement.findIndex((id, i) => round.truth[i] !== id);
  const id = wrong === -1 ? (round.truth[0] as string) : (round.arrangement[wrong] as string);
  return { ...round, hint: { id, position: round.truth.indexOf(id) } };
}

export const submit = (round: OrderRound): OrderRound =>
  round.status === "arranging" ? { ...round, status: "revealed" } : round;

/** Correctly ordered pairs out of 10. */
export function correctPairs(arrangement: readonly string[], truth: readonly string[]): number {
  const rank = new Map(truth.map((id, i) => [id, i]));
  let n = 0;
  for (let i = 0; i < arrangement.length; i++)
    for (let j = i + 1; j < arrangement.length; j++)
      if (
        (rank.get(arrangement[i] as string) as number) <
        (rank.get(arrangement[j] as string) as number)
      )
        n++;
  return n;
}

/** Order score (rank-it §6): pairs × 10, minus 20 when the hint was used, never below 0. */
export function orderPoints(round: OrderRound): number {
  const base = correctPairs(round.arrangement, round.truth) * 10;
  return Math.max(0, base - (round.hint ? HINT_PENALTY : 0));
}
