import { norm } from "@meridian/name-matcher";
import type { Difficulty, RoundState, SilEntity } from "./types";
import type { World } from "./world";

/** Hint ladder (silhouette §7.1). */
export const HINT_COUNT = 4;

export type HintContent =
  | { hint: 1; areaKm2: number; largerThanPercent: number }
  | { hint: 2; continent: string }
  | { hint: 3; kind: "remote"; parts: SilEntity["remote"] }
  | { hint: 3; kind: "neighbors"; count: number }
  | { hint: 4; letter: string };

/** Points each hint costs: 1, doubled on Hard (silhouette §6.2). Practice hints are free. */
export const hintCost = (difficulty: Difficulty, mode: RoundState["mode"]): number =>
  mode === "practice" ? 0 : difficulty === "hard" ? 2 : 1;

/** Easy rounds start with the continent revealed for free. */
export const freeHints = (difficulty: Difficulty): readonly number[] =>
  difficulty === "easy" ? [2] : [];

export const isOpen = (state: RoundState, n: number): boolean =>
  state.hints.includes(n) || freeHints(state.difficulty).includes(n);

/** Opens a hint. Opening one twice, or after the round ends, changes nothing. */
export function openHint(state: RoundState, n: number): RoundState {
  if (state.status !== "guessing" || n < 1 || n > HINT_COUNT || isOpen(state, n)) return state;
  return { ...state, hints: [...state.hints, n] };
}

export function hintContent(world: World, targetId: string, n: number): HintContent {
  const t = world.byId.get(targetId);
  if (!t) throw new RangeError(`unknown target ${targetId}`);
  switch (n) {
    case 1: {
      const others = world.entities.filter((e) => e.type === "country" && e.id !== t.id);
      const smaller = others.filter((e) => e.areaKm2 < t.areaKm2).length;
      return {
        hint: 1,
        areaKm2: Math.round(t.areaKm2),
        largerThanPercent: others.length ? Math.floor((100 * smaller) / others.length) : 0,
      };
    }
    case 2:
      return { hint: 2, continent: t.continent };
    case 3:
      return t.remote.length > 0
        ? { hint: 3, kind: "remote", parts: t.remote }
        : { hint: 3, kind: "neighbors", count: world.neighbors.get(t.id)?.size ?? 0 };
    case 4:
      return { hint: 4, letter: (norm(t.name)[0] ?? "").toUpperCase() };
    default:
      throw new RangeError(`no hint ${n}`);
  }
}
