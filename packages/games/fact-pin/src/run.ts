import { newTimer, pauseTimer, remainingMs, startTimer } from "@meridian/game-kit";
import {
  applyCap,
  capFor,
  countryHintAllowed,
  distanceToTarget,
  rawScore,
  roundPin,
  type AreaResolver,
} from "./scoring";
import type { FactPinConfig, FactRound, Hint, Pin, PinFact, RunState } from "./types";

const fresh = (factId: string, timerSec: number, now: number): FactRound => ({
  factId,
  pin: null,
  hints: [],
  result: null,
  timer: timerSec > 0 ? startTimer(newTimer(), now) : newTimer(),
});

/** Starts a run on a list of fact ids. The timer of the first fact starts at once (when one is configured). */
export function startRun(
  config: FactPinConfig,
  seed: string,
  factIds: readonly string[],
  now: number,
): RunState {
  const first = factIds[0];
  if (first === undefined) throw new RangeError("a run needs at least one fact");
  return {
    config,
    seed,
    factIds: [...factIds],
    index: 0,
    rounds: [fresh(first, config.timerSec, now)],
    phase: "asking",
  };
}

export const currentRound = (s: RunState): FactRound => s.rounds[s.index] as FactRound;
export const currentFactId = (s: RunState): string => s.factIds[s.index] as string;

/** Places or moves the pin. Placing does not reveal anything (AC-FP-005). */
export function placePin(s: RunState, pin: Pin): RunState {
  if (s.phase !== "asking") return s;
  return withRound(s, { ...currentRound(s), pin: roundPin(pin) });
}

const withRound = (s: RunState, r: FactRound): RunState => ({
  ...s,
  rounds: s.rounds.map((x, i) => (i === s.index ? r : x)),
});

/** Takes a hint. It lowers the cap for this fact and returns what to highlight (the UI draws it). */
export function takeHint(s: RunState, fact: PinFact, hint: Hint): RunState {
  if (s.phase !== "asking") return s;
  const r = currentRound(s);
  if (r.hints.includes(hint)) return s;
  if (hint === "country" && !countryHintAllowed(fact)) return s;
  return withRound(s, { ...r, hints: [...r.hints, hint] });
}

/** Confirms the pin and reveals the result: distance, score with the hint cap, and the stopped timer. */
export function confirm(
  s: RunState,
  fact: PinFact,
  areas: AreaResolver,
  now: number,
  timedOut = false,
): RunState {
  if (s.phase !== "asking") return s;
  const r = currentRound(s);
  const timer = pauseTimer(r.timer, now);
  if (!r.pin) {
    // No pin: score 0 (AC-FP-007). Only a timeout may confirm without a pin.
    if (!timedOut) return s;
    return {
      ...withRound(s, {
        ...r,
        timer,
        result: { distanceKm: 0, rawScore: 0, score: 0, cap: capFor(r.hints), timedOut: true },
      }),
      phase: "revealed",
    };
  }
  const distanceKm = distanceToTarget(fact, r.pin, areas);
  const raw = rawScore(distanceKm, fact.precision);
  const cap = capFor(r.hints);
  return {
    ...withRound(s, {
      ...r,
      timer,
      result: { distanceKm, rawScore: raw, score: applyCap(raw, cap), cap, timedOut },
    }),
    phase: "revealed",
  };
}

/** Time left on the current fact in ms, or null when there is no timer. */
export const timeLeftMs = (s: RunState, now: number): number | null =>
  s.config.timerSec === 0 || s.phase !== "asking"
    ? null
    : remainingMs(currentRound(s).timer, now, s.config.timerSec * 1000);

/** The timer reached zero: the current pin is confirmed (AC-FP-006), or the fact scores 0 with no pin (AC-FP-007). */
export function tick(s: RunState, fact: PinFact, areas: AreaResolver, now: number): RunState {
  const left = timeLeftMs(s, now);
  return left !== null && left <= 0 ? confirm(s, fact, areas, now, true) : s;
}

/** Pause and resume the fact timer (tab hidden, reload). */
export const pause = (s: RunState, now: number): RunState =>
  s.phase === "asking"
    ? withRound(s, { ...currentRound(s), timer: pauseTimer(currentRound(s).timer, now) })
    : s;
export const resume = (s: RunState, now: number): RunState =>
  s.phase === "asking" && s.config.timerSec > 0
    ? withRound(s, { ...currentRound(s), timer: startTimer(currentRound(s).timer, now) })
    : s;

/** Total of the revealed facts. */
export const total = (s: RunState): number =>
  s.rounds.reduce((sum, r) => sum + (r.result?.score ?? 0), 0);

/** Endless mode: the average score so far and the best streak of pins worth 800 or more. */
export function endlessStats(s: RunState): { average: number; bestStreak: number; played: number } {
  const scores = s.rounds.flatMap((r) => (r.result ? [r.result.score] : []));
  let best = 0;
  let run = 0;
  for (const x of scores) {
    run = x >= 800 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return {
    average: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    bestStreak: best,
    played: scores.length,
  };
}

/**
 * Moves on. After the last fact of a run the run is done; in Endless, `more` supplies the next fact ids when the
 * drawn ones are used up.
 */
export function next(s: RunState, now: number, more: () => string[] = () => []): RunState {
  if (s.phase !== "revealed") return s;
  const isEndless = s.config.mode === "endless";
  let ids = s.factIds;
  if (s.index + 1 >= ids.length) {
    if (!isEndless) return { ...s, phase: "done" };
    ids = [...ids, ...more()];
    if (s.index + 1 >= ids.length) return { ...s, phase: "done" };
  }
  const id = ids[s.index + 1] as string;
  return {
    ...s,
    factIds: ids,
    index: s.index + 1,
    rounds: [...s.rounds, fresh(id, s.config.timerSec, now)],
    phase: "asking",
  };
}

/** Everything the summary shows: per-fact rows and the total out of 1000 × facts. */
export function summary(s: RunState): {
  total: number;
  max: number;
  rows: { factId: string; score: number; distanceKm: number; timedOut: boolean }[];
} {
  const rows = s.rounds.flatMap((r) =>
    r.result
      ? [
          {
            factId: r.factId,
            score: r.result.score,
            distanceKm: r.result.distanceKm,
            timedOut: r.result.timedOut,
          },
        ]
      : [],
  );
  return { total: total(s), max: rows.length * 1000, rows };
}
