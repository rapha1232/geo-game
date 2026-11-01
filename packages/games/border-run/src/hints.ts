import { component, shortestPaths } from "./graph";
import { append, classify, revealed, type BrWorld } from "./round";
import type { HintKind, RoundState } from "./types";

export const HINT_COST = 2;

/** Unrevealed countries that lie on some shortest route, ids sorted. */
function onRouteUnrevealed(w: BrWorld, s: RoundState): string[] {
  const seen = revealed(s);
  return [...w.graph.keys()]
    .filter((id) => !seen.has(id) && classify(w, s, id) === "on-route")
    .sort();
}

/**
 * Which of them touch the connected group around A, else the group around B, else any: the "frontier"
 * (border-run §7). Growing from A first keeps the hint a step-by-step walk.
 */
function frontier(w: BrWorld, s: RoundState): string[] {
  const seen = revealed(s);
  const cands = onRouteUnrevealed(w, s);
  for (const end of [s.a, s.b]) {
    const group = component(w.graph, end, seen);
    const touching = cands.filter((id) => (w.graph.get(id) ?? []).some((n) => group.has(n)));
    if (touching.length > 0) return touching;
  }
  return cands;
}

/** "Next outline": one unrevealed on-route country next to what the player has so far. Stable for a given state. */
export const nextOutline = (w: BrWorld, s: RoundState): string | null => frontier(w, s)[0] ?? null;

/** "Initials": first letters of the intermediates of one shortest route, in order A → B. */
export function initials(w: BrWorld, s: RoundState): string[] {
  const path = shortestPaths(w.graph, s.a, s.b, 1)[0] ?? [];
  return path.slice(1, -1).map((id) => (w.world.byId.get(id)?.name ?? "?").charAt(0).toUpperCase());
}

/** Whether another hint of this kind can be given now. */
export function hintAvailable(w: BrWorld, s: RoundState, kind: HintKind): boolean {
  if (s.status !== "routing") return false;
  if (kind === "initials") return !s.hints.some((h) => h.kind === "initials");
  return frontier(w, s).length > 0;
}

/**
 * Uses a hint. "Reveal one" counts as a guess (border-run §7) and may end the round. The result is state, so a
 * reload keeps what the hint showed.
 */
export function useHint(w: BrWorld, s: RoundState, kind: HintKind): RoundState {
  if (!hintAvailable(w, s, kind)) return s;
  if (kind === "initials") return { ...s, hints: [...s.hints, { kind }] };
  const id = frontier(w, s)[0] as string;
  if (kind === "outline") return { ...s, hints: [...s.hints, { kind, entityId: id }] };
  const withHint: RoundState = { ...s, hints: [...s.hints, { kind, entityId: id }] };
  return append(w, withHint, { entityId: id, input: "", cls: "on-route", viaHint: true });
}
