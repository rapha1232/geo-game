import {
  CONTINENT_NAMES,
  generateMatchRound,
  generateTileRound,
  matchScore,
  tileScore,
  type MatchRound,
  type QuizWorld,
  type TileCriterion,
  type TileRound,
} from "@meridian/quiz";
import type { Timer } from "@meridian/game-kit";

/** The R2 round-style quizzes (quiz-library §2.2): select-all tiles and two-column matching. */
export type RoundQuiz =
  | {
      slug: string;
      title: string;
      category: "countries";
      kind: "tiles";
      criterion: TileCriterion;
      prompt: string;
    }
  | { slug: string; title: string; category: "capitals"; kind: "match"; prompt: string };

const CONTINENT_SLUGS: Record<string, string> = {
  AF: "africa",
  AS: "asia",
  EU: "europe",
  NA: "north-america",
  OC: "oceania",
  SA: "south-america",
};

export const ROUND_QUIZZES: readonly RoundQuiz[] = [
  {
    slug: "landlocked-countries",
    title: "Landlocked or Not",
    category: "countries",
    kind: "tiles",
    criterion: { kind: "landlocked" },
    prompt: "Select every landlocked country",
  },
  ...Object.entries(CONTINENT_SLUGS).map(([id, slug]): RoundQuiz => ({
    slug: `pick-the-countries-of-${slug}`,
    title: `Pick the Countries of ${CONTINENT_NAMES[id]}`,
    category: "countries",
    kind: "tiles",
    criterion: { kind: "continent", id },
    prompt: `Select every country in ${CONTINENT_NAMES[id]}`,
  })),
  {
    slug: "match-the-capitals",
    title: "Match the Capitals",
    category: "capitals",
    kind: "match",
    prompt: "Pair each country with its capital",
  },
];

export const findRound = (slug: string): RoundQuiz | undefined =>
  ROUND_QUIZZES.find((q) => q.slug === slug);

export type Round = TileRound | MatchRound;

/** Plain JSON, saved after every action and restored on reload. */
export type RoundSession = {
  slug: string;
  seed: string;
  /** The lives the player chose before starting. */
  lives?: 1 | 3;
  round: Round;
  timer: Timer;
  startedAt: number;
  resultId: string | null;
  resumed: boolean;
};

export function newRoundSession(
  world: QuizWorld,
  quiz: RoundQuiz,
  seed: string,
  lives: 1 | 3 | undefined,
  now: number,
): RoundSession {
  const round =
    quiz.kind === "tiles"
      ? generateTileRound(world, quiz.criterion, seed, lives)
      : generateMatchRound(world, seed, lives);
  return {
    slug: quiz.slug,
    seed,
    ...(lives ? { lives } : {}),
    round,
    timer: { elapsedMs: 0, runningSince: now },
    startedAt: now,
    resultId: null,
    resumed: false,
  };
}

/** Points out of 100, whole numbers. */
export const roundPoints = (r: Round): number =>
  Math.round((r.kind === "tiles" ? tileScore(r) : matchScore(r)) * 100);

export const roundOutcome = (r: Round): "completed" | "lives_out" =>
  r.status === "lives_out" ? "lives_out" : "completed";

export const roundPbKey = (slug: string, lives: number | undefined): string =>
  `round|${slug}${lives ? `|lives${lives}` : ""}`;
