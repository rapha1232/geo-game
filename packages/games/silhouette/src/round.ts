import type { Rng } from "@meridian/game-kit";
import type { MatchContext, MatchResult } from "@meridian/name-matcher";
import { feedback } from "./feedback";
import { MAX_GUESSES, type Difficulty, type GuessRow, type Mode, type RoundState } from "./types";
import type { World } from "./world";

export type StartOptions = { targetId: string; mode: Mode; difficulty: Difficulty };

/** A new round. On Hard the shape is rotated by a seeded angle, so the same seed gives the same rotation (AC-SH-017). */
export function startRound(world: World, opts: StartOptions, rng: Rng): RoundState {
  if (!world.byId.has(opts.targetId)) throw new RangeError(`unknown target ${opts.targetId}`);
  return {
    targetId: opts.targetId,
    mode: opts.mode,
    difficulty: opts.difficulty,
    status: "guessing",
    guesses: [],
    hints: [],
    rotation: opts.difficulty === "hard" ? rng.fork("rotation").nextInt(360) : 0,
    gaveUp: false,
  };
}

/** Practice has unlimited guesses. */
export const maxGuesses = (state: RoundState): number | null =>
  state.mode === "practice" ? null : MAX_GUESSES;

export const guessesLeft = (state: RoundState): number | null => {
  const max = maxGuesses(state);
  return max === null ? null : Math.max(0, max - state.guesses.length);
};

export type GuessEvent =
  | { kind: "ignored" }
  | { kind: "not-recognized" }
  | { kind: "try-english" }
  | { kind: "already-guessed"; entityId: string }
  | { kind: "ambiguous"; message: string }
  | { kind: "round-over" }
  | { kind: "accepted"; row: GuessRow };

/** Every entity is a valid guess, whatever the target pool (silhouette §2). */
function context(world: World, state: RoundState): MatchContext {
  const all = new Set(world.entities.map((e) => e.id));
  return {
    mode: "type_prompted",
    remaining: all,
    promptAnswers: all,
    inQuiz: all,
    strictness: "standard",
    named: new Set(state.guesses.map((g) => g.entityId)),
  };
}

function resolve(world: World, state: RoundState, input: string): MatchResult {
  return world.index.match(input, context(world, state), { submitted: true });
}

/**
 * Submits typed text (Enter). Invalid and repeated guesses, and ambiguous names, consume nothing (AC-SH-006, 008).
 * Pure: returns the next state and what happened.
 */
export function submitGuess(
  world: World,
  state: RoundState,
  input: string,
): { state: RoundState; event: GuessEvent } {
  if (state.status !== "guessing") return { state, event: { kind: "round-over" } };
  const r = resolve(world, state, input);
  switch (r.kind) {
    case "ignore":
    case "try-english":
      return { state, event: { kind: r.kind === "ignore" ? "ignored" : "try-english" } };
    case "not-recognized":
      return { state, event: { kind: "not-recognized" } };
    case "ambiguous":
      return { state, event: { kind: "ambiguous", message: r.message } };
    case "already-named":
      return { state, event: { kind: "already-guessed", entityId: r.entityId } };
    case "accept":
    case "wrong":
    case "hold":
    case "not-in-quiz": {
      return guessEntity(world, state, r.entityId, input, r.kind === "accept" ? r.notes : []);
    }
  }
}

/** Submits an entity directly (picking a suggestion). */
export function guessEntity(
  world: World,
  state: RoundState,
  entityId: string,
  input = "",
  notes: readonly ("former-name" | "spelling-corrected")[] = [],
): { state: RoundState; event: GuessEvent } {
  if (state.status !== "guessing") return { state, event: { kind: "round-over" } };
  const guess = world.byId.get(entityId);
  const target = world.byId.get(state.targetId);
  if (!guess || !target) return { state, event: { kind: "not-recognized" } };
  if (state.guesses.some((g) => g.entityId === entityId))
    return { state, event: { kind: "already-guessed", entityId } };
  const shares = world.neighbors.get(target.id)?.has(guess.id) ?? false;
  const note = notes.includes("spelling-corrected")
    ? ("spelling-corrected" as const)
    : notes.includes("former-name")
      ? ("former-name" as const)
      : undefined;
  const row: GuessRow = { ...feedback(guess, target, shares), input, ...(note ? { note } : {}) };
  const guesses = [...state.guesses, row];
  const max = maxGuesses(state);
  const status = row.correct
    ? "solved"
    : max !== null && guesses.length >= max
      ? "failed"
      : "guessing";
  return { state: { ...state, guesses, status }, event: { kind: "accepted", row } };
}

/** Give up: the round is lost and the answer revealed. */
export const giveUp = (state: RoundState): RoundState =>
  state.status === "guessing" ? { ...state, status: "failed", gaveUp: true } : state;
