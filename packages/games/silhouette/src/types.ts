import type { MatchEntity } from "@meridian/name-matcher";
import type { Sector8 } from "@meridian/geo";

export type Difficulty = "easy" | "normal" | "hard";
export type Mode = "unlimited" | "practice" | "daily" | "seeded";
export type DistanceUnit = "km" | "mi";
export type FollowUpKind = "capital" | "flag";

/** A guessable entity as the engine sees it (built from `core.countries` and the silhouette pack). */
export type SilEntity = MatchEntity & {
  type: "country" | "territory";
  /** Continent code: AF, AS, EU, NA, OC, SA. */
  continent: string;
  areaKm2: number;
  /** [lat, lon] pole of inaccessibility of the largest polygon. */
  ref: readonly [number, number];
  /** `difficulty.shape`, 0 (easy) to 1 (hard). */
  shape: number;
  sets: readonly string[];
  /** Accepted capitals, official first. */
  capitals: readonly string[];
  /** Remote parts, largest first. */
  remote: readonly { ref: readonly [number, number]; areaKm2: number }[];
  /** Flags often confused with this one (country ids). */
  confusables?: readonly string[];
};

export const MAX_GUESSES = 6;

/** One row of the guess list (silhouette §7.2). */
export type GuessRow = {
  entityId: string;
  /** What the player typed, kept for the "Accepted as" note. */
  input: string;
  correct: boolean;
  /** Whole km (always km on the wire; the UI converts for display). */
  distanceKm: number;
  /** Exact bearing in whole degrees, or null when both ref points coincide. */
  bearing: number | null;
  sector: Sector8 | null;
  /** 0 to 100. */
  proximity: number;
  sharesBorder: boolean;
  /** Set when the match corrected a typo or used a former name. */
  note?: "spelling-corrected" | "former-name";
};

export type RoundStatus = "guessing" | "solved" | "failed";

/** Plain JSON: saved after every guess and restored on reload (AC-SH-016). */
export type RoundState = {
  targetId: string;
  mode: Mode;
  difficulty: Difficulty;
  status: RoundStatus;
  guesses: GuessRow[];
  /** Hint numbers (1 to 4) the player has opened, in order. */
  hints: number[];
  /** Degrees, 0 unless difficulty is hard. */
  rotation: number;
  gaveUp: boolean;
};
