import type { Timer } from "@meridian/game-kit";

export type Precision = "exact" | "city" | "region" | "country" | "broad";
export type Difficulty = "easy" | "normal" | "hard";
export type Mode = "run" | "endless" | "daily" | "seeded";

/** The part of a fact record the engine reads. The pack has more (sources, reveal text, status, review dates). */
export type PinFact = {
  id: string;
  text: string;
  answerLabel: string;
  category: string;
  era: string;
  precision: Precision;
  target:
    | { type: "point"; coords: readonly [number, number] }
    | { type: "entity"; id: string }
    | { type: "polygon"; ref: string };
  toleranceKm?: number | undefined;
  reveal: string;
  sources: readonly { title: string; url: string }[];
  difficulty: number;
  /** Entity ids, used so no two facts of a run share one. */
  entities: readonly string[];
  /** AF, AS, EU, NA, OC, SA. */
  continent: string;
  status: "draft" | "published" | "suspended" | "retired";
  /** Country entity ids that contain the answer, for the country hint. */
  countries?: readonly string[];
};

export type FactPinConfig = {
  mode: Mode;
  /** Empty means all categories. */
  categories: readonly string[];
  /** Empty means all eras. */
  eras: readonly string[];
  /** Seconds per fact; 0 is off. */
  timerSec: 0 | 15 | 30;
  difficulty: Difficulty;
  /** Facts per run. */
  runLength: number;
};

export const DEFAULT_CONFIG: FactPinConfig = {
  mode: "run",
  categories: [],
  eras: [],
  timerSec: 0,
  difficulty: "normal",
  runLength: 5,
};

export type Pin = { lat: number; lon: number };

export type Hint = "continent" | "country";

/** One fact of a run, from asked to revealed. */
export type FactRound = {
  factId: string;
  pin: Pin | null;
  hints: Hint[];
  /** Set at confirmation. */
  result: {
    distanceKm: number;
    rawScore: number;
    score: number;
    cap: number | null;
    timedOut: boolean;
  } | null;
  timer: Timer;
};

/** Plain JSON, saved after every action and restored on reload. */
export type RunState = {
  config: FactPinConfig;
  seed: string;
  /** The facts of this run, in order (endless: those drawn so far). */
  factIds: string[];
  index: number;
  rounds: FactRound[];
  phase: "asking" | "revealed" | "done";
};

export const SCALE_KM: Record<Precision, number> = {
  exact: 250,
  city: 400,
  region: 700,
  country: 1000,
  broad: 1500,
};
/** Default tolerance for a point target without its own (fact-pin §6.1). */
export const DEFAULT_TOLERANCE_KM: Record<Precision, number> = {
  exact: 25,
  city: 50,
  region: 150,
  country: 0,
  broad: 0,
};
export const HINT_CAP: Record<Hint, number> = { continent: 700, country: 400 };
export const MAX_SCORE = 1000;
