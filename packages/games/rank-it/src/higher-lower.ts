import type { Rng } from "@meridian/game-kit";
import { candidatesFor, chooseStat, separationFactor, shuffle, type Candidate } from "./generate";
import { separated } from "./stats";
import type { RankConfig, RankWorld, StatDef } from "./types";

/** Higher/Lower pairs only need half the Order separation (≥ 5%), rank-it §5. */
export const PAIR_FACTOR = 0.5;

export type HigherLowerRun = {
  kind: "higher-lower";
  stat: string;
  scope: string;
  /** Entity shown with its value. */
  current: string;
  /** Entity the player judges against it. */
  next: string;
  /** Entities already used this run, so the run never repeats one. */
  used: string[];
  streak: number;
  status: "playing" | "over";
  /** The entity the player picked wrong against, once the run is over. */
  lastPick: "higher" | "lower" | null;
};

function nextOpponent(
  def: StatDef,
  pool: readonly Candidate[],
  current: Candidate,
  used: ReadonlySet<string>,
  factor: number,
  rng: Rng,
): Candidate | null {
  return (
    shuffle(pool, rng).find(
      (c) => !used.has(c.id) && separated(def, current.value, c.value, factor),
    ) ?? null
  );
}

export function newRun(
  w: RankWorld,
  config: RankConfig,
  recentStats: readonly string[],
  rng: Rng,
): HigherLowerRun | null {
  const def = chooseStat(w, config, recentStats, rng.fork("stat"));
  if (!def) return null;
  const pool = candidatesFor(w, def.id, config.scope, config.difficulty, rng.fork("pool"));
  const factor = PAIR_FACTOR * separationFactor(config.difficulty);
  const first = shuffle(pool, rng.fork("first"))[0];
  if (!first) return null;
  const second = nextOpponent(def, pool, first, new Set([first.id]), factor, rng.fork("second"));
  if (!second) return null;
  return {
    kind: "higher-lower",
    stat: def.id,
    scope: config.scope,
    current: first.id,
    next: second.id,
    used: [first.id, second.id],
    streak: 0,
    status: "playing",
    lastPick: null,
  };
}

/**
 * The player says whether `next` is higher or lower than `current`. A correct pick moves on: the judged entity becomes
 * the one shown with its value and a new opponent appears. The first wrong pick ends the run.
 */
export function pick(
  w: RankWorld,
  config: RankConfig,
  run: HigherLowerRun,
  choice: "higher" | "lower",
  rng: Rng,
): HigherLowerRun {
  if (run.status !== "playing") return run;
  const def = w.statById.get(run.stat) as StatDef;
  const a = w.values[run.stat]?.[run.current]?.[0] as number;
  const b = w.values[run.stat]?.[run.next]?.[0] as number;
  const right = choice === "higher" ? b > a : b < a;
  if (!right) return { ...run, status: "over", lastPick: choice };
  const pool = candidatesFor(w, run.stat, run.scope, config.difficulty, rng.fork("pool"));
  const used = new Set(run.used);
  const opponent = nextOpponent(
    def,
    pool,
    { id: run.next, value: b },
    used,
    PAIR_FACTOR * separationFactor(config.difficulty),
    rng.fork("opponent"),
  );
  // Running out of fresh entities ends the run as a clean finish, not a loss.
  if (!opponent) return { ...run, streak: run.streak + 1, status: "over", lastPick: choice };
  return {
    ...run,
    current: run.next,
    next: opponent.id,
    used: [...run.used, opponent.id],
    streak: run.streak + 1,
    lastPick: choice,
  };
}

/** Higher/Lower score is the streak length (rank-it §6). */
export const streakPoints = (run: HigherLowerRun): number => run.streak;
