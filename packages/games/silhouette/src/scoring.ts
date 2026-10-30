import { freeHints, hintCost } from "./hints";
import type { RoundState } from "./types";

/**
 * Round score (silhouette §6.1): solved in n guesses is `7 − n − hint cost`, at least 1. A failed round scores 0,
 * and each correct follow-up adds 1. Practice is unscored.
 */
export function roundPoints(state: RoundState, followUpsCorrect = 0): number {
  if (state.mode === "practice") return 0;
  if (state.status !== "solved") return 0;
  const paid = state.hints.filter((h) => !freeHints(state.difficulty).includes(h)).length;
  const base = Math.max(
    1,
    7 - state.guesses.length - paid * hintCost(state.difficulty, state.mode),
  );
  return base + followUpsCorrect;
}

export type SessionSummary = {
  points: number;
  rounds: number;
  solved: number;
  solveRate: number;
  averageGuesses: number | null;
};

/** Session summary: total points, rounds, solve rate and average guesses on solved rounds. */
export function summarize(
  rounds: readonly { state: RoundState; followUpsCorrect: number }[],
): SessionSummary {
  const scored = rounds.filter((r) => r.state.mode !== "practice");
  const solved = scored.filter((r) => r.state.status === "solved");
  return {
    points: scored.reduce((s, r) => s + roundPoints(r.state, r.followUpsCorrect), 0),
    rounds: scored.length,
    solved: solved.length,
    solveRate: scored.length ? solved.length / scored.length : 0,
    averageGuesses: solved.length
      ? solved.reduce((s, r) => s + r.state.guesses.length, 0) / solved.length
      : null,
  };
}
