import { makeRng, newTimer, pauseTimer, startTimer, type Timer } from "@meridian/game-kit";
import {
  DEFAULT_CONFIG as ENGINE_DEFAULT,
  newOrderRound,
  newRun,
  newTopPicks,
  orderPoints,
  pick as hlPick,
  streakPoints,
  topPoints,
  move as orderMove,
  submit as orderSubmit,
  togglePick,
  reveal as topReveal,
  useHint as orderHint,
  statOfCombo,
  type HigherLowerRun,
  type OrderRound,
  type RankConfig,
  type RankWorld,
  type TopPicksRound,
} from "@meridian/rank-it";

export type Config = RankConfig;
export const DEFAULT_CONFIG: Config = ENGINE_DEFAULT;

export type Round = OrderRound | TopPicksRound | HigherLowerRun;

/** The whole game in plain JSON: saved after every action and restored on reload. */
export type Session = {
  seed: string;
  config: Config;
  roundNo: number;
  round: Round;
  /** Combo ids of past Order and Top Picks rounds, for the Repeat Guard. */
  history: string[];
  /** Statistic ids of the last rounds, so Random does not repeat itself. */
  recentStats: string[];
  /** Points from rounds finished before this one. */
  total: number;
  phase: "playing" | "revealed";
  timer: Timer;
  startedAt: number;
  resultId: string | null;
  resumed: boolean;
};

export const poolKey = (c: Config): string => `${c.format}|${c.stat}|${c.scope}|${c.difficulty}`;

const roundRng = (seed: string, c: Config, n: number) =>
  makeRng(seed, "rank-it", { f: c.format, s: c.stat, c: c.scope, d: c.difficulty }).fork(
    `round:${n}`,
  );

function begin(
  w: RankWorld,
  seed: string,
  config: Config,
  n: number,
  history: string[],
  recentStats: string[],
): Pick<Session, "round" | "history" | "recentStats"> {
  const rng = roundRng(seed, config, n);
  if (config.format === "higher-lower") {
    const run = newRun(w, config, recentStats, rng);
    if (!run) throw new RangeError("no statistic matches these options");
    return { round: run, history, recentStats: [...recentStats, run.stat].slice(-4) };
  }
  const g =
    config.format === "order"
      ? newOrderRound(w, config, history, rng)
      : newTopPicks(w, config, history, rng);
  if (!g) throw new RangeError("no statistic matches these options");
  return {
    round: g.round,
    history: g.history,
    recentStats: [...recentStats, statOfCombo(g.combo)].slice(-4),
  };
}

export function newSession(
  w: RankWorld,
  seed: string,
  config: Config = DEFAULT_CONFIG,
  history: string[] = [],
  now = 0,
): Session {
  return {
    seed,
    config,
    roundNo: 1,
    ...begin(w, seed, config, 1, history, []),
    total: 0,
    phase: "playing",
    timer: startTimer(newTimer(), now),
    startedAt: now,
    resultId: null,
    resumed: false,
  };
}

/** True when the options can produce a round (e.g. a continent with too few countries for Top Picks). */
export function canPlay(w: RankWorld, config: Config): boolean {
  try {
    begin(w, "probe", config, 1, [], []);
    return true;
  } catch {
    return false;
  }
}

export function setClock(s: Session, running: boolean, now: number): Session {
  const live = running && s.phase === "playing";
  if (live === (s.timer.runningSince !== null)) return s;
  return { ...s, timer: live ? startTimer(s.timer, now) : pauseTimer(s.timer, now) };
}

export const restore = (s: Session): Session => ({
  ...s,
  timer: { elapsedMs: s.timer.elapsedMs, runningSince: null },
  resumed: true,
});

const end = (s: Session, now: number): Session => ({
  ...s,
  phase: "revealed",
  timer: s.timer.runningSince === null ? s.timer : pauseTimer(s.timer, now),
});

export function points(s: Session): number {
  switch (s.round.kind) {
    case "order":
      return s.round.status === "revealed" ? orderPoints(s.round) : 0;
    case "top-picks":
      return s.round.status === "revealed" ? topPoints(s.round) : 0;
    case "higher-lower":
      return streakPoints(s.round);
  }
}
export const maxPoints = (s: Session): number =>
  s.round.kind === "order" ? 100 : s.round.kind === "top-picks" ? 15 : Math.max(1, points(s));

export function move(s: Session, from: number, to: number): Session {
  return s.round.kind === "order" && s.phase === "playing"
    ? { ...s, round: orderMove(s.round, from, to) }
    : s;
}
export const hint = (s: Session): Session =>
  s.round.kind === "order" && s.phase === "playing" ? { ...s, round: orderHint(s.round) } : s;

export function submit(s: Session, now = 0): Session {
  if (s.phase !== "playing") return s;
  if (s.round.kind === "order") return end({ ...s, round: orderSubmit(s.round) }, now);
  if (s.round.kind === "top-picks") return end({ ...s, round: topReveal(s.round) }, now);
  return s;
}
export const toggle = (s: Session, id: string): Session =>
  s.round.kind === "top-picks" && s.phase === "playing"
    ? { ...s, round: togglePick(s.round, id) }
    : s;

export function choose(w: RankWorld, s: Session, choice: "higher" | "lower", now = 0): Session {
  if (s.round.kind !== "higher-lower" || s.phase !== "playing") return s;
  const rng = roundRng(s.seed, s.config, s.roundNo).fork(`step:${s.round.streak}`);
  const round = hlPick(w, s.config, s.round, choice, rng);
  const next = { ...s, round };
  return round.status === "over" ? end(next, now) : next;
}

export function next(w: RankWorld, s: Session, now = 0): Session {
  if (s.phase !== "revealed") return s;
  const roundNo = s.roundNo + 1;
  return {
    ...s,
    total: s.total + (s.round.kind === "higher-lower" ? 0 : points(s)),
    roundNo,
    ...begin(w, s.seed, s.config, roundNo, s.history, s.recentStats),
    phase: "playing",
    timer: startTimer(newTimer(), now),
    startedAt: now,
    resultId: null,
    resumed: false,
  };
}
