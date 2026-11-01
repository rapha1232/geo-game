import { HINT_COST } from "./hints";
import type { RoundState } from "./types";

/**
 * Round score (border-run §6): a win with g guesses is `max(1, 10 − (g − m) × 2 − hints × 2)`, a perfect run (g = m)
 * is 10, a loss is 0. Practice is unscored. A "Reveal one" counts as both a guess and a hint.
 */
export function roundPoints(s: RoundState): number {
  if (s.mode === "practice" || s.status !== "won") return 0;
  const extra = s.guesses.length - s.m;
  return Math.max(1, 10 - extra * 2 - s.hints.length * HINT_COST);
}

export type SessionSummary = {
  points: number;
  rounds: number;
  won: number;
  winRate: number;
  averageGuesses: number | null;
};

export function summarize(rounds: readonly RoundState[]): SessionSummary {
  const scored = rounds.filter((r) => r.mode !== "practice");
  const won = scored.filter((r) => r.status === "won");
  return {
    points: scored.reduce((sum, r) => sum + roundPoints(r), 0),
    rounds: scored.length,
    won: won.length,
    winRate: scored.length ? won.length / scored.length : 0,
    averageGuesses: won.length ? won.reduce((n, r) => n + r.guesses.length, 0) / won.length : null,
  };
}
