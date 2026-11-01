import { makeRng, newTimer, pauseTimer, startTimer, type Timer } from "@meridian/game-kit";
import {
  DEFAULT_CONFIG as ENGINE_DEFAULT,
  giveUp,
  guessEntity,
  pairPool,
  roundPoints,
  selectPair,
  startRound,
  submitGuess,
  useHint,
  type BrConfig,
  type GuessEvent,
  type HintKind,
  type Mode,
  type RoundState,
} from "@meridian/border-run";
import type { LoadedBorderRun } from "./data";

export type Config = BrConfig & { mode: Extract<Mode, "unlimited" | "practice"> };

export const DEFAULT_CONFIG: Config = { ...ENGINE_DEFAULT, mode: "unlimited" };

/** Rounds with the same pool share a Repeat Guard history. */
export const poolKey = (c: Config): string =>
  `${c.region}|${c.route}|${c.crossings ? "x" : "land"}`;

/** The whole game in plain JSON: saved after every action and restored on reload. */
export type Session = {
  seed: string;
  config: Config;
  roundNo: number;
  round: RoundState;
  /** Pair ids, oldest first, for the Repeat Guard. */
  history: string[];
  guardRelaxed: boolean;
  done: RoundState[];
  phase: "routing" | "review";
  lastEvent: GuessEvent | null;
  timer: Timer;
  startedAt: number;
  resultId: string | null;
  resumed: boolean;
};

const roundRng = (seed: string, c: Config, n: number) =>
  makeRng(seed, "border-run", { r: c.region, l: c.route, x: c.crossings }).fork(`round:${n}`);

function begin(
  data: LoadedBorderRun,
  seed: string,
  config: Config,
  roundNo: number,
  history: string[],
): Pick<Session, "round" | "history" | "guardRelaxed"> {
  const bw = data.bw(config.crossings);
  const pool = pairPool(bw.graph, config, data.continentOf);
  if (pool.length === 0) throw new RangeError("no routes match these options");
  const pick = selectPair(pool, history, roundRng(seed, config, roundNo).fork("pair"));
  return {
    round: startRound(bw, { a: pick.a, b: pick.b, mode: config.mode, config }),
    history: [...pick.history],
    guardRelaxed: pick.guardRelaxed,
  };
}

export function newSession(
  data: LoadedBorderRun,
  seed: string,
  config: Config = DEFAULT_CONFIG,
  history: string[] = [],
  now = 0,
): Session {
  return {
    seed,
    config,
    roundNo: 1,
    ...begin(data, seed, config, 1, history),
    done: [],
    phase: "routing",
    lastEvent: null,
    timer: startTimer(newTimer(), now),
    startedAt: now,
    resultId: null,
    resumed: false,
  };
}

/** True when the options can produce at least one route (e.g. a small continent on Hard has none). */
export const hasRoutes = (data: LoadedBorderRun, config: Config): boolean =>
  pairPool(data.bw(config.crossings).graph, config, data.continentOf).length > 0;

export function setClock(s: Session, running: boolean, now: number): Session {
  const live = running && s.phase === "routing";
  if (live === (s.timer.runningSince !== null)) return s;
  return { ...s, timer: live ? startTimer(s.timer, now) : pauseTimer(s.timer, now) };
}

/** A restored session: the clock stays paused until the page reports it is visible. */
export const restore = (s: Session): Session => ({
  ...s,
  timer: { elapsedMs: s.timer.elapsedMs, runningSince: null },
  resumed: true,
});

function finish(s: Session, now: number): Session {
  if (s.round.status === "routing") return s;
  const timer = s.timer.runningSince === null ? s.timer : pauseTimer(s.timer, now);
  return { ...s, timer, phase: "review" };
}

export function guess(data: LoadedBorderRun, s: Session, input: string, now = 0): Session {
  if (s.phase !== "routing") return s;
  const r = submitGuess(data.bw(s.config.crossings), s.round, input);
  return finish({ ...s, round: r.state, lastEvent: r.event }, now);
}

export function pick(data: LoadedBorderRun, s: Session, entityId: string, now = 0): Session {
  if (s.phase !== "routing") return s;
  const name = data.world.byId.get(entityId)?.name ?? "";
  const r = guessEntity(data.bw(s.config.crossings), s.round, entityId, name);
  return finish({ ...s, round: r.state, lastEvent: r.event }, now);
}

export function hint(data: LoadedBorderRun, s: Session, kind: HintKind, now = 0): Session {
  if (s.phase !== "routing") return s;
  return finish({ ...s, round: useHint(data.bw(s.config.crossings), s.round, kind) }, now);
}

export const surrender = (s: Session, now = 0): Session =>
  s.phase === "routing" ? finish({ ...s, round: giveUp(s.round), lastEvent: null }, now) : s;

export const points = (s: Session): number => roundPoints(s.round);

/** Records the finished round and starts the next one. */
export function next(data: LoadedBorderRun, s: Session, now = 0): Session {
  if (s.phase !== "review") return s;
  const roundNo = s.roundNo + 1;
  return {
    ...s,
    done: [...s.done, s.round],
    roundNo,
    ...begin(data, s.seed, s.config, roundNo, s.history),
    phase: "routing",
    lastEvent: null,
    timer: startTimer(newTimer(), now),
    startedAt: now,
    resultId: null,
    resumed: false,
  };
}
