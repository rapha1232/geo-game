import { configHash, elapsedMs } from "@meridian/game-kit";
import { gameResult, type GameResult } from "@meridian/schemas";
import {
  CONTINENT_NAMES,
  MATCH_PAIRS,
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

export function roundResult(
  s: RoundSession,
  ctx: { id: string; contentVersion: string; endedAt: number },
): GameResult {
  const r = s.round;
  const ms = Math.round(elapsedMs(s.timer, ctx.endedAt));
  const startedAt = Math.min(s.startedAt, ctx.endedAt);
  const lives = s.lives;
  const config = { round: s.slug, kind: r.kind, ...(lives !== undefined ? { lives } : {}) };
  const items =
    r.kind === "tiles"
      ? [
          ...r.correct.map((id) => ({
            item_id: id,
            entity_id: id,
            status: r.selected.includes(id) ? "correct" : "missed",
          })),
          ...r.selected
            .filter((id) => !r.correct.includes(id))
            .map((id) => ({ item_id: id, entity_id: id, status: "wrong" })),
        ]
      : [
          ...r.matched.map((id) => ({ item_id: id, entity_id: id, status: "correct" })),
          ...r.left
            .filter((id) => !r.matched.includes(id))
            .map((id) => ({ item_id: id, entity_id: id, status: "missed" })),
        ];
  return gameResult.parse({
    id: ctx.id,
    game_id: "quiz",
    mode: "untimed",
    config,
    config_hash: configHash(config),
    pb_key: roundPbKey(s.slug, lives),
    seed: s.seed,
    content_version: ctx.contentVersion,
    score: roundPoints(r),
    max_score: 100,
    outcome: roundOutcome(r),
    items: items.slice(0, 500),
    meta:
      r.kind === "match" ? { pairs: MATCH_PAIRS, mistakes: r.mistakes } : { tiles: r.tiles.length },
    flags: { resumed: s.resumed, pauseCount: 0, assisted: false, guardRelaxed: false, attempt: 1 },
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(ctx.endedAt).toISOString(),
    active_ms: Math.min(ms, Math.max(0, ctx.endedAt - startedAt) + 60_000),
  });
}
