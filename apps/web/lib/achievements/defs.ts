import type { GameResult } from "@meridian/schemas";
import type { MasteryRecord } from "../storage/db";

/** Rounds that count towards anything: practice, learn and review runs are for learning, not for badges. */
const COUNTS = (r: GameResult): boolean =>
  r.mode !== "practice" && r.mode !== "practice-misses" && r.mode !== "learn";

export type Where = {
  game?: string;
  /** Only rounds with this outcome. */
  outcome?: GameResult["outcome"];
  /** Solved in the first guess (Silhouette). */
  firstGuess?: boolean;
  /** `score / max_score` at least this. */
  ratio?: number;
  /** `score` at least this. */
  minScore?: number;
  /** Only this mode. */
  mode?: string;
  /** `config.format` equals this (Rank It). */
  format?: string;
};

export type Rule =
  | { kind: "count"; where: Where; min: number }
  | { kind: "games-tried"; min: number }
  | { kind: "mastery-average"; min: number };

export type Achievement = {
  id: string;
  name: string;
  /** What to do, never a guilt message. */
  how: string;
  rule: Rule;
};

/**
 * Achievements are plain data evaluated on this device from stored results (UX_AND_DESIGN §7.2). They live in code
 * rather than `content/achievements.yaml` for now: the conditions are tied to result shapes the app owns.
 */
export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: "ACH-SH-FIRST",
    name: "First Look",
    how: "Solve a Silhouette in 1 guess.",
    rule: {
      kind: "count",
      where: { game: "silhouette", outcome: "solved", firstGuess: true },
      min: 1,
    },
  },
  {
    id: "ACH-SH-10",
    name: "Sharp Eye",
    how: "Solve 10 Silhouettes.",
    rule: { kind: "count", where: { game: "silhouette", outcome: "solved" }, min: 10 },
  },
  {
    id: "ACH-SH-50",
    name: "Shape Shifter",
    how: "Solve 50 Silhouettes.",
    rule: { kind: "count", where: { game: "silhouette", outcome: "solved" }, min: 50 },
  },
  {
    id: "ACH-SH-DAILY-7",
    name: "Daily Outline",
    how: "Play 7 Silhouette dailies.",
    rule: { kind: "count", where: { game: "silhouette", mode: "daily" }, min: 7 },
  },
  {
    id: "ACH-FP-FIRST",
    name: "First Pin",
    how: "Finish a Fact Pin run.",
    rule: { kind: "count", where: { game: "fact-pin" }, min: 1 },
  },
  {
    id: "ACH-FP-SHARP",
    name: "Bullseye",
    how: "Score at least 90% of the points in a Fact Pin run.",
    rule: { kind: "count", where: { game: "fact-pin", ratio: 0.9 }, min: 1 },
  },
  {
    id: "ACH-FP-10",
    name: "Pin Cushion",
    how: "Finish 10 Fact Pin runs.",
    rule: { kind: "count", where: { game: "fact-pin" }, min: 10 },
  },
  {
    id: "ACH-BR-FIRST",
    name: "Connected",
    how: "Connect two countries in Border Run.",
    rule: { kind: "count", where: { game: "border-run", outcome: "solved" }, min: 1 },
  },
  {
    id: "ACH-BR-PERFECT",
    name: "Straight Line",
    how: "Connect a Border Run route with no extra guesses and no hints.",
    rule: { kind: "count", where: { game: "border-run", outcome: "solved", ratio: 1 }, min: 1 },
  },
  {
    id: "ACH-BR-25",
    name: "Frequent Flyer",
    how: "Connect 25 Border Run routes.",
    rule: { kind: "count", where: { game: "border-run", outcome: "solved" }, min: 25 },
  },
  {
    id: "ACH-RK-ORDER",
    name: "Perfect Order",
    how: "Score 100 in a Rank It order round.",
    rule: { kind: "count", where: { game: "rank-it", format: "order", ratio: 1 }, min: 1 },
  },
  {
    id: "ACH-RK-ROLL",
    name: "On a Roll",
    how: "Reach a streak of 10 in Rank It higher or lower.",
    rule: {
      kind: "count",
      where: { game: "rank-it", format: "higher-lower", minScore: 10 },
      min: 1,
    },
  },
  {
    id: "ACH-RK-TOP",
    name: "Top Five",
    how: "Score 15 in Rank It top picks.",
    rule: { kind: "count", where: { game: "rank-it", format: "top-picks", ratio: 1 }, min: 1 },
  },
  {
    id: "ACH-QZ-FIRST",
    name: "Quiz Starter",
    how: "Finish a quiz.",
    rule: { kind: "count", where: { game: "quiz" }, min: 1 },
  },
  {
    id: "ACH-QZ-PERFECT",
    name: "Flawless",
    how: "Get every answer right in a quiz.",
    rule: { kind: "count", where: { game: "quiz", ratio: 1 }, min: 1 },
  },
  {
    id: "ACH-QZ-10",
    name: "Quiz Regular",
    how: "Finish 10 quizzes.",
    rule: { kind: "count", where: { game: "quiz" }, min: 10 },
  },
  {
    id: "ACH-ALL-GAMES",
    name: "Explorer",
    how: "Play all five games.",
    rule: { kind: "games-tried", min: 5 },
  },
  {
    id: "ACH-MS-80",
    name: "Cartographer",
    how: "Average mastery of 0.8 or more across all 197 countries.",
    rule: { kind: "mastery-average", min: 0.8 },
  },
];

export const COUNTRY_TOTAL = 197;

function matches(r: GameResult, w: Where): boolean {
  if (!COUNTS(r)) return false;
  if (w.game && r.game_id !== w.game) return false;
  if (w.outcome && r.outcome !== w.outcome) return false;
  if (w.mode && r.mode !== w.mode) return false;
  if (w.format && (r.config as { format?: string }).format !== w.format) return false;
  if (w.firstGuess && r.items[0]?.attempts !== 1) return false;
  if (w.minScore !== undefined && r.score < w.minScore) return false;
  if (w.ratio !== undefined) {
    if (r.max_score <= 0) return false;
    if (r.score / r.max_score < w.ratio) return false;
  }
  return true;
}

/** Mean of each country's mean mastery, over all 197 countries (0 for a country never seen). */
export function masteryAverage(mastery: readonly MasteryRecord[]): number {
  const by = new Map<string, number[]>();
  for (const m of mastery) {
    if (!m.entity_id.startsWith("country:")) continue;
    (by.get(m.entity_id) ?? by.set(m.entity_id, []).get(m.entity_id)!).push(m.mastery);
  }
  let sum = 0;
  for (const v of by.values()) sum += v.reduce((a, b) => a + b, 0) / v.length;
  return sum / COUNTRY_TOTAL;
}

/** The result that completed a count rule, so the badge can point at it. */
export type Evaluation = { id: string; resultId: string | null };

/** Achievements met by these results, in definition order. Pure and deterministic. */
export function evaluate(
  results: readonly GameResult[],
  mastery: readonly MasteryRecord[],
): Evaluation[] {
  const ordered = [...results].sort((a, b) => a.ended_at.localeCompare(b.ended_at));
  const out: Evaluation[] = [];
  for (const a of ACHIEVEMENTS) {
    const r = a.rule;
    if (r.kind === "count") {
      if (r.min <= 0) continue;
      const hits = ordered.filter((x) => matches(x, r.where));
      if (hits.length >= r.min) out.push({ id: a.id, resultId: hits[r.min - 1]?.id ?? null });
    } else if (r.kind === "games-tried") {
      const seen = new Set<string>();
      for (const x of ordered)
        if (COUNTS(x)) {
          seen.add(x.game_id);
          if (seen.size >= r.min) {
            out.push({ id: a.id, resultId: x.id });
            break;
          }
        }
    } else if (masteryAverage(mastery) >= r.min) out.push({ id: a.id, resultId: null });
  }
  return out;
}
