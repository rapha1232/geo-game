import { makeRng, configHash } from "@meridian/game-kit";
import {
  drawRun,
  eligibleFacts,
  next as nextFact,
  startRun,
  type FactPinConfig,
  type RunState,
} from "@meridian/fact-pin";
import type { LoadedFactPin } from "./data";

export type FactKind = "run" | "endless" | "daily";

/** The whole game in plain JSON: saved after every action and restored after a reload. */
export type FactSession = {
  run: RunState;
  kind: FactKind;
  seed: string;
  /** Local date of a daily run. */
  date?: string;
  /** Fact ids the player has seen, oldest first (the Repeat Guard history). */
  seen: string[];
  recycled: boolean;
  startedWall: number;
  resumed: boolean;
  resultId: string | null;
};

export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const newSeed = (): string => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHABET[b % 32]).join("");
};

/** The Repeat Guard history is kept per category/era/difficulty filter. */
export const poolKey = (c: FactPinConfig): string =>
  `${[...c.categories].sort().join(",")}|${[...c.eras].sort().join(",")}|${c.difficulty}`;

/** The PB key: runs with the same filters, timer and length compare against each other (fact-pin §9). */
export const pbKeyOf = (c: FactPinConfig): string =>
  `fact-pin:${c.mode}:${poolKey(c)}|t${c.timerSec}|n${c.runLength}`;

const rngFor = (seed: string, c: FactPinConfig, label: string) =>
  makeRng(seed, "fact-pin", {
    cats: c.categories,
    eras: c.eras,
    d: c.difficulty,
    n: c.runLength,
    h: configHash(c),
  }).fork(label);

export class NotEnoughFacts extends Error {}

/** Starts a Run of 5 or an Endless session (the Repeat Guard applies; `excluded` holds recent dailies). */
export function newFactSession(
  data: LoadedFactPin,
  config: FactPinConfig,
  seen: readonly string[],
  excluded: ReadonlySet<string>,
  seed: string,
  nowWall: number,
  nowMono: number,
): FactSession {
  const pool = eligibleFacts(data.facts, config);
  if (pool.length < config.runLength) throw new NotEnoughFacts();
  const draw = drawRun(
    pool,
    config,
    seen,
    config.runLength,
    rngFor(seed, config, "run:1"),
    excluded,
  );
  return {
    run: startRun(config, seed, draw.ids, nowMono),
    kind: config.mode === "endless" ? "endless" : "run",
    seed,
    seen: draw.seen,
    recycled: draw.recycled,
    startedWall: nowWall,
    resumed: false,
    resultId: null,
  };
}

/** Today's Daily 5: the schedule decides the facts. No timer, no Repeat Guard, no history. */
export function newDailySession(
  config: FactPinConfig,
  ids: readonly string[],
  date: string,
  nowWall: number,
  nowMono: number,
): FactSession {
  const c: FactPinConfig = { ...config, mode: "daily", timerSec: 0, runLength: ids.length };
  return {
    run: startRun(c, date.replaceAll("-", "").padEnd(10, "0"), ids, nowMono),
    kind: "daily",
    seed: date.replaceAll("-", "").padEnd(10, "0"),
    date,
    seen: [],
    recycled: false,
    startedWall: nowWall,
    resumed: false,
    resultId: null,
  };
}

/** Moves to the next fact. In Endless a fresh batch is drawn when the current one runs out. */
export function advance(
  data: LoadedFactPin,
  s: FactSession,
  nowMono: number,
  excluded: ReadonlySet<string> = new Set(),
): FactSession {
  let seen = s.seen;
  let recycled = s.recycled;
  const more = (): string[] => {
    const c = s.run.config;
    const pool = eligibleFacts(data.facts, c);
    const batch = Math.floor(s.run.factIds.length / c.runLength) + 1;
    const draw = drawRun(pool, c, seen, c.runLength, rngFor(s.seed, c, `run:${batch}`), excluded);
    seen = draw.seen;
    recycled = recycled || draw.recycled;
    return draw.ids;
  };
  const run = nextFact(s.run, nowMono, more);
  return run === s.run ? s : { ...s, run, seen, recycled };
}

/** Endless ends when the player says so. */
export const finishRun = (s: FactSession): FactSession =>
  s.run.phase === "revealed" ? { ...s, run: { ...s.run, phase: "done" } } : s;

/** A restored session pauses its timer: the clock restarts when the page reports it is visible. */
export function restoreSession(s: FactSession): FactSession {
  const rounds = s.run.rounds.map((r) => ({
    ...r,
    timer: { elapsedMs: r.timer.elapsedMs, runningSince: null },
  }));
  return { ...s, run: { ...s.run, rounds }, resumed: true };
}
