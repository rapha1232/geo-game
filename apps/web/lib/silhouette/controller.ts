import {
  makeRng,
  newTimer,
  pauseTimer,
  pushHistory,
  startTimer,
  type Timer,
} from "@meridian/game-kit";
import {
  answerFollowUp,
  followUp,
  giveUp,
  guessEntity,
  openHint,
  roundPoints,
  selectTarget,
  startRound,
  submitGuess,
  targetPool,
  type Difficulty,
  type FollowUp,
  type FollowUpKind,
  type GuessEvent,
  type Mode,
  type PoolSpec,
  type RoundState,
  type World,
} from "@meridian/silhouette";

export type Config = {
  mode: Mode;
  difficulty: Difficulty;
  pool: PoolSpec;
  followUps: FollowUpKind[];
  unit: "km" | "mi";
  /** Local calendar date of a daily round (`YYYY-MM-DD`). */
  date?: string;
};

export const DEFAULT_CONFIG: Config = {
  mode: "unlimited",
  difficulty: "normal",
  pool: { kind: "sovereign-197" },
  followUps: ["capital", "flag"],
  unit: "km",
};

export type FollowUpState = { prompt: FollowUp; choice: number | null };

/** The whole game in plain JSON: saved after every action and restored on reload (AC-SH-016). */
export type Session = {
  seed: string;
  config: Config;
  /** Rounds started so far, 1-based. Seeds each round's sub-stream. */
  roundNo: number;
  round: RoundState;
  followUps: FollowUpState[];
  /** Target ids, oldest first, for the Repeat Guard. */
  history: string[];
  guardRelaxed: boolean;
  /** Finished rounds of this session for the summary. */
  done: { state: RoundState; followUpsCorrect: number }[];
  /** Phase after the round: guess list, follow-ups, then the Learn card. */
  phase: "guessing" | "followups" | "learn" | "finished";
  /** Last feedback line, not persisted meaning. */
  lastEvent: GuessEvent | null;
  /** Active time of the current round: pauses when the tab is hidden and on reload (ARCHITECTURE §9). */
  timer: Timer;
  /** Wall-clock ms when this round began, for the result's `started_at`. */
  startedAt: number;
  /** Set once the round's result has been written, so a reload never writes it twice. */
  resultId: string | null;
  /** The player resumed this round after a reload. */
  resumed: boolean;
  /** A seeded challenge: the fixed targets, in order, and the sender's score if they shared one. */
  challenge?: { code: string; targets: string[]; sc?: number };
};

export type Env = { world: World; seed: string };

const roundRng = (seed: string, config: Config, n: number) =>
  makeRng(seed, "silhouette", { pool: config.pool, d: config.difficulty }).fork(`round:${n}`);

function begin(
  world: World,
  seed: string,
  config: Config,
  roundNo: number,
  history: string[],
): Pick<Session, "round" | "history" | "guardRelaxed"> {
  const rng = roundRng(seed, config, roundNo);
  const pool = targetPool(world, config.pool, config.difficulty);
  if (pool.length === 0) throw new RangeError("the target pool is empty");
  const pick = selectTarget(world, pool, config.difficulty, history, rng.fork("target"));
  return {
    round: startRound(
      world,
      { targetId: pick.id, mode: config.mode, difficulty: config.difficulty },
      rng,
    ),
    history: [...pick.history],
    guardRelaxed: pick.guardRelaxed,
  };
}

export function newSession(
  world: World,
  seed: string,
  config: Config = DEFAULT_CONFIG,
  history: string[] = [],
  now = 0,
): Session {
  return {
    seed,
    config,
    roundNo: 1,
    ...begin(world, seed, config, 1, history),
    followUps: [],
    done: [],
    phase: "guessing",
    lastEvent: null,
    timer: startTimer(newTimer(), now),
    startedAt: now,
    resultId: null,
    resumed: false,
  };
}

/** Today's daily: the target comes from the schedule, so nobody's history matters and everyone gets the same shape. */
export function newDailySession(
  world: World,
  seed: string,
  targetId: string,
  date: string,
  now = 0,
  mode: "daily" | "practice" = "daily",
): Session {
  const config: Config = { ...DEFAULT_CONFIG, mode, date };
  const rng = roundRng(seed, config, 1);
  return {
    seed,
    config,
    roundNo: 1,
    round: startRound(world, { targetId, mode, difficulty: config.difficulty }, rng),
    history: [],
    guardRelaxed: false,
    followUps: [],
    done: [],
    phase: "guessing",
    lastEvent: null,
    timer: startTimer(newTimer(), now),
    startedAt: now,
    resultId: null,
    resumed: false,
  };
}

/** A seeded challenge (silhouette §3): fixed targets in order, no Repeat Guard history, no daily rules. */
export function newChallengeSession(
  world: World,
  seed: string,
  config: Omit<Config, "mode">,
  challenge: NonNullable<Session["challenge"]>,
  now = 0,
): Session {
  const full: Config = { ...config, mode: "seeded" };
  const rng = roundRng(seed, full, 1);
  const first = challenge.targets[0];
  if (!first) throw new RangeError("a challenge needs at least one target");
  return {
    seed,
    config: full,
    roundNo: 1,
    round: startRound(world, { targetId: first, mode: "seeded", difficulty: full.difficulty }, rng),
    history: [],
    guardRelaxed: false,
    followUps: [],
    done: [],
    phase: "guessing",
    lastEvent: null,
    timer: startTimer(newTimer(), now),
    startedAt: now,
    resultId: null,
    resumed: false,
    challenge,
  };
}

/** Points so far in a challenge and the most it could have scored. */
export function challengeTotals(s: Session): { points: number; max: number; solved: number } {
  const rounds = [
    ...s.done,
    ...(s.phase === "learn" ? [{ state: s.round, followUpsCorrect: followUpsCorrect(s) }] : []),
  ];
  const perRound = 6 + s.config.followUps.length;
  return {
    points: rounds.reduce((sum, r) => sum + roundPoints(r.state, r.followUpsCorrect), 0),
    max: (s.challenge?.targets.length ?? rounds.length) * perRound,
    solved: rounds.filter((r) => r.state.status === "solved").length,
  };
}

/** Pauses or resumes the round clock (tab hidden or visible). The clock stops when the round ends. */
export function setClock(s: Session, running: boolean, now: number): Session {
  const live = running && s.phase === "guessing";
  const isRunning = s.timer.runningSince !== null;
  if (live === isRunning) return s;
  return { ...s, timer: live ? startTimer(s.timer, now) : pauseTimer(s.timer, now) };
}

/** A restored session: the clock stays paused until the page reports it is visible, and the round is marked resumed. */
export const restore = (s: Session): Session => ({
  ...s,
  timer: { elapsedMs: s.timer.elapsedMs, runningSince: null },
  resumed: true,
});

/** Moves to the follow-ups (if any are on) or the Learn card once the round ends. */
function finish(world: World, s: Session, now: number): Session {
  if (s.round.status === "guessing") return s;
  const timer = s.timer.runningSince === null ? s.timer : pauseTimer(s.timer, now);
  s = { ...s, timer };
  const rng = roundRng(s.seed, s.config, s.roundNo).fork("followups");
  const kinds = s.config.mode === "practice" ? [] : s.config.followUps;
  const followUps = kinds.map((k) => ({
    prompt: followUp(world, k, s.round.targetId, rng),
    choice: null,
  }));
  return { ...s, followUps, phase: followUps.length > 0 ? "followups" : "learn" };
}

export function guess(world: World, s: Session, input: string, now = 0): Session {
  if (s.phase !== "guessing") return s;
  const r = submitGuess(world, s.round, input);
  return finish(world, { ...s, round: r.state, lastEvent: r.event }, now);
}

export function pick(world: World, s: Session, entityId: string, now = 0): Session {
  if (s.phase !== "guessing") return s;
  const r = guessEntity(world, s.round, entityId, world.byId.get(entityId)?.name ?? "");
  return finish(world, { ...s, round: r.state, lastEvent: r.event }, now);
}

export const hint = (s: Session, n: number): Session =>
  s.phase === "guessing" ? { ...s, round: openHint(s.round, n) } : s;

export const surrender = (world: World, s: Session, now = 0): Session =>
  s.phase === "guessing"
    ? finish(world, { ...s, round: giveUp(s.round), lastEvent: null }, now)
    : s;

/** One attempt per follow-up. After the last one the Learn card shows. */
export function answer(s: Session, index: number, choice: number): Session {
  const f = s.followUps[index];
  if (s.phase !== "followups" || !f || f.choice !== null) return s;
  const followUps = s.followUps.map((x, i) => (i === index ? { ...x, choice } : x));
  const all = followUps.every((x) => x.choice !== null);
  return { ...s, followUps, phase: all ? "learn" : "followups" };
}

export const followUpsCorrect = (s: Session): number =>
  s.followUps.filter((f) => f.choice !== null && answerFollowUp(f.prompt, f.choice)).length;

export const points = (s: Session): number => roundPoints(s.round, followUpsCorrect(s));

/** Records the finished round and starts the next one (Unlimited and Practice). */
export function next(world: World, s: Session, now = 0): Session {
  if (s.phase !== "learn" || s.config.mode === "daily") return s;
  const done = [...s.done, { state: s.round, followUpsCorrect: followUpsCorrect(s) }];
  const roundNo = s.roundNo + 1;
  if (s.challenge) {
    const target = s.challenge.targets[roundNo - 1];
    if (!target) return { ...s, done, phase: "finished", lastEvent: null };
    const rng = roundRng(s.seed, s.config, roundNo);
    return {
      ...s,
      done,
      roundNo,
      round: startRound(
        world,
        { targetId: target, mode: "seeded", difficulty: s.config.difficulty },
        rng,
      ),
      followUps: [],
      phase: "guessing",
      lastEvent: null,
      timer: startTimer(newTimer(), now),
      startedAt: now,
      resultId: null,
      resumed: false,
    };
  }
  return {
    ...s,
    done,
    roundNo,
    ...begin(world, s.seed, s.config, roundNo, s.history),
    followUps: [],
    phase: "guessing",
    lastEvent: null,
    timer: startTimer(newTimer(), now),
    startedAt: now,
    resultId: null,
    resumed: false,
  };
}

export { pushHistory };
