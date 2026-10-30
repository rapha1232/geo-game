import type { MatchEntity } from "@meridian/name-matcher";
import type { Timer } from "@meridian/game-kit";

export const TEMPLATES = [
  "countries.by-name",
  "capitals.by-country",
  "countries.by-capital",
  "flags.by-country",
  "continents.by-name",
  "regions.by-name",
  "countries.by-continent",
] as const;
export type Template = (typeof TEMPLATES)[number];

export const FORMATS = ["TYPE_ALL", "TYPE_PROMPTED", "MAP_CLICK", "MULTIPLE_CHOICE"] as const;
export type Format = (typeof FORMATS)[number];

export type Difficulty = "easy" | "normal" | "hard";
export type CountrySet = "sovereign-197" | "un-193" | "sovereign+territories";
export type Order = "random" | "alphabetical" | "largest";
export type Skill = "recall" | "locate" | "flag" | "capital" | "shape";

/** `world`, a continent (`AF`…) or a UN subregion slug. */
export type Scope =
  { kind: "world" } | { kind: "continent"; id: string } | { kind: "region"; id: string };

/** A country or territory as the quiz engine sees it. */
export type QuizEntity = MatchEntity & {
  type: "country" | "territory";
  continent: string;
  /** UN subregion id (slug) and display name. */
  region: { id: string; name: string } | null;
  areaKm2: number;
  /** Accepted capitals with their roles, official first. */
  capitals: readonly { name: string; role: string }[];
  /** Skill priors in [0, 1], higher = harder. */
  difficulty: Partial<Record<Skill, number>>;
  sets: readonly string[];
  /** Flags often confused with this one (country ids). */
  confusables?: readonly string[];
};

/** A continent or subregion as an answer: it is "found" by clicking any of its countries. */
export type QuizGroup = {
  id: string;
  kind: "continent" | "region";
  name: string;
  members: readonly string[];
};

export type QuizConfig = {
  template: Template;
  scope: Scope;
  format: Format;
  countrySet: CountrySet;
  /** `all` or a random subset size. */
  count: "all" | number;
  order: Order;
  timed: boolean;
  difficulty: Difficulty;
  strictness: "lenient" | "standard" | "strict";
  /** Learn mode: nothing is scored and answers can be revealed. */
  learn?: boolean;
  /** Hints are on unless Hard difficulty or a challenge turned them off. */
  hints?: boolean;
};

export type Prompt =
  | { kind: "none" }
  /** Highlight a country, or every member of a group. */
  | { kind: "highlight"; target: string }
  | { kind: "flag"; target: string }
  | { kind: "text"; text: string };

export type QuizItem = {
  /** The slot: a country id, or a group id. */
  id: string;
  prompt: Prompt;
  /** Entity ids in the answer universe that count as correct when typed or chosen. */
  answerIds: string[];
  /** Country ids that count as correct when clicked (MAP_CLICK). */
  mapIds: string[];
  /** MULTIPLE_CHOICE: option ids (country or group ids) and the index of the right one. */
  options?: string[];
  correctIndex?: number;
};

export type Universe = "country" | "capital" | "group";

export type Quiz = {
  config: QuizConfig;
  seed: string;
  universe: Universe;
  items: QuizItem[];
  /** Null for untimed and Learn. */
  limitMs: number | null;
};

export type ItemStatus = "pending" | "correct" | "missed" | "revealed";
export type ItemNote = "spelling-corrected" | "former-name";

export type ItemState = {
  status: ItemStatus;
  /** 0 to 1. */
  score: number;
  attempts: number;
  /** Hints used on this item. */
  hints: number;
  /** What the player typed to get it. */
  input?: string;
  note?: ItemNote;
  /** TYPE_PROMPTED: already skipped once, so Skip is now Reveal. */
  skipped?: boolean;
  /** TYPE_ALL: highlighted by the hint, so it scores 0.5. */
  highlighted?: boolean;
  /** MULTIPLE_CHOICE: option indexes removed by 50/50. */
  removed?: number[];
  /** MULTIPLE_CHOICE: the option chosen. */
  chosen?: number;
};

export type Phase = "ready" | "playing" | "paused" | "review";
export type EndReason = "complete" | "timeout" | "give_up";

/** Plain JSON: saved after every action and restored on reload (AC-QZ-012). */
export type QuizState = {
  quiz: Quiz;
  phase: Phase;
  timer: Timer;
  items: ItemState[];
  /** Indexes of items still to ask (prompted formats), in order. */
  queue: number[];
  hintsUsed: number;
  /** MULTIPLE_CHOICE 50/50 uses so far. */
  fiftyUsed: number;
  endReason?: EndReason;
};

export const MAX_ATTEMPTS = 3;
export const MAP_CLICK_SCORES = [1, 0.5, 0.25] as const;
export const MAX_TYPE_ALL_HINTS = 5;
