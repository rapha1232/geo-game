import { makeRng, newTimer, pauseTimer, startTimer, type Timer } from "@meridian/game-kit";
import {
  advance,
  composeRun,
  lock,
  select,
  startRun,
  type RunMode,
  type RunState,
  type TimerSetting,
} from "@meridian/deep-cut";
import type { LoadedDeepCut } from "./data";

export type Config = { mode: RunMode | "daily"; timer: TimerSetting; date?: string };
export const DEFAULT_CONFIG: Config = { mode: "run", timer: 60 };

export type LockInfo = { valid: boolean; points: number; message: string | null };

/** Plain JSON, saved after every action and restored on reload. */
export type Session = {
  seed: string;
  config: Config;
  run: RunState;
  /** Prompt ids already played, oldest first, for the Repeat Guard. */
  history: string[];
  /** Time left on the current prompt in ms; null when the timer is off. Paused on reload (ARCHITECTURE §9). */
  remainingMs: number | null;
  /** `prompt` while choosing, `reveal` after locking in; the run is over when `run.status` is `done`. */
  phase: "prompt" | "reveal";
  lastLock: LockInfo | null;
  timer: Timer;
  startedAt: number;
  resultId: string | null;
  resumed: boolean;
};

const limit = (c: Config): number | null =>
  c.mode === "practice" || c.timer === 0 ? null : c.timer * 1000;

export function newSession(
  data: LoadedDeepCut,
  seed: string,
  config: Config,
  history: string[],
  now: number,
): Session {
  const rng = makeRng(seed, "deep-cut", { m: config.mode, t: config.timer });
  const { ids, history: next } = composeRun(
    data.prompts,
    config.mode === "daily" ? [] : history,
    rng,
  );
  const run = startRun(
    { prompt: (id) => data.byId.get(id) },
    ids,
    config.mode === "practice" ? "practice" : "run",
    config.timer,
  );
  return {
    seed,
    config,
    run,
    history: config.mode === "daily" ? history : next,
    remainingMs: limit(config),
    phase: "prompt",
    lastLock: null,
    timer: startTimer(newTimer(), now),
    startedAt: now,
    resultId: null,
    resumed: false,
  };
}

export const pick = (s: Session, id: string | null): Session =>
  s.phase === "prompt" ? { ...s, run: select(s.run, id) } : s;

/** Locks in the selection (or the timer ran out) and moves to the reveal. */
export function lockIn(data: LoadedDeepCut, s: Session, timedOut = false, now = 0): Session {
  if (s.phase !== "prompt") return s;
  const r = lock(
    s.run,
    { prompt: (id) => data.byId.get(id) },
    (id) => data.world.byId.get(id)?.name ?? id,
    { timedOut },
  );
  return {
    ...s,
    run: r.state,
    phase: "reveal",
    lastLock: { valid: r.valid, points: r.points, message: r.message },
    remainingMs: s.remainingMs === null ? null : timedOut ? 0 : s.remainingMs,
    timer: s.timer.runningSince === null ? s.timer : pauseTimer(s.timer, now),
  };
}

/** The next prompt (restarting the timer), or the summary after the fifth. */
export function next(s: Session, now = 0): Session {
  if (s.phase !== "reveal") return s;
  const run = advance(s.run);
  return {
    ...s,
    run,
    phase: "prompt",
    lastLock: null,
    remainingMs: run.status === "done" ? null : limit(s.config),
    timer: run.status === "done" ? s.timer : startTimer(s.timer, now),
  };
}

export const tickTime = (s: Session, deltaMs: number): Session =>
  s.phase === "prompt" && s.remainingMs !== null
    ? { ...s, remainingMs: Math.max(0, s.remainingMs - deltaMs) }
    : s;

export function setClock(s: Session, running: boolean, now: number): Session {
  const live = running && s.phase === "prompt" && s.run.status === "playing";
  if (live === (s.timer.runningSince !== null)) return s;
  return { ...s, timer: live ? startTimer(s.timer, now) : pauseTimer(s.timer, now) };
}

export const restore = (s: Session): Session => ({
  ...s,
  timer: { elapsedMs: s.timer.elapsedMs, runningSince: null },
  resumed: true,
});
