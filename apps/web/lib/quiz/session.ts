import { makeRng } from "@meridian/game-kit";
import {
  generatePractice,
  generateQuiz,
  newQuizState,
  practicePlan,
  repeatWindow,
  skillFor,
  countryPool,
  type MasteryRow,
  type PracticePlan,
  type QuizConfig,
  type QuizState,
  type QuizWorld,
} from "@meridian/quiz";
import type { QuizKind } from "./results";

/** The whole quiz screen state as plain JSON: saved after every action and restored on reload (AC-QZ-012). */
export type QuizSession = {
  slug: string;
  kind: QuizKind;
  seed: string;
  state: QuizState;
  /** The player resumed this quiz after a reload. */
  resumed: boolean;
  /** Wall-clock ms when it was created, for `started_at`. */
  startedWall: number;
  /** Set once the result has been written, so a reload never writes it twice. */
  resultId: string | null;
  /** "Only 3 weak spots. Adding 7 near-misses." for Practice my misses. */
  notice?: string;
};

/** Ids of the last instances of this template and scope, kept trimmed to the repeat window (quiz-library §11.2). */
export const poolKey = (c: QuizConfig): string =>
  `${c.template}|${c.scope.kind === "world" ? "world" : `${c.scope.kind}:${c.scope.id}`}|${c.format}`;

export function newQuiz(
  world: QuizWorld,
  slug: string,
  config: QuizConfig,
  seed: string,
  history: readonly string[],
  nowWall: number,
): QuizSession {
  const quiz = generateQuiz(world, config, seed, [history]);
  return {
    slug,
    kind: "normal",
    seed,
    state: newQuizState(quiz),
    resumed: false,
    startedWall: nowWall,
    resultId: null,
  };
}

/** "Replay same" reuses the seed, so the items and their order are identical. */
export const replaySame = (world: QuizWorld, s: QuizSession, nowWall: number): QuizSession => {
  const quiz = generateQuiz(world, s.state.quiz.config, s.seed, []);
  return { ...s, state: newQuizState(quiz), resumed: false, startedWall: nowWall, resultId: null };
};

export function practiceMisses(
  world: QuizWorld,
  slug: string,
  config: QuizConfig,
  seed: string,
  rows: readonly MasteryRow[],
  nowWall: number,
): QuizSession {
  const skill = skillFor(config.template, config.format);
  const candidates = countryPool(world, config.countrySet, config.scope).map((e) => e.id);
  const plan: PracticePlan = practicePlan(rows, skill, candidates);
  const quiz = generatePractice(world, config, seed, plan);
  const notice =
    plan.added > 0
      ? `Only ${plan.weak} weak spot${plan.weak === 1 ? "" : "s"}. Adding ${plan.added} near-miss${plan.added === 1 ? "" : "es"}.`
      : undefined;
  return {
    slug,
    kind: "practice",
    seed,
    state: newQuizState(quiz),
    resumed: false,
    startedWall: nowWall,
    resultId: null,
    ...(notice ? { notice } : {}),
  };
}

/** The history to store after a subset quiz: its items, trimmed to the repeat window. */
export function nextHistory(prev: readonly string[], s: QuizSession, poolSize: number): string[] {
  const count = s.state.quiz.items.length;
  if (s.state.quiz.config.count === "all") return [];
  const keep = repeatWindow(poolSize, Math.max(1, count)) * count;
  return [...prev, ...s.state.quiz.items.map((i) => i.id)].slice(-keep);
}

export const newQuizSeed = (): string => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32]).join("");
};

export { makeRng };
