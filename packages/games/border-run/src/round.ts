import type { World } from "@meridian/silhouette";
import type { MatchContext } from "@meridian/name-matcher";
import { component, distances, pathLength, type Graph } from "./graph";
import {
  EXTRA_GUESSES,
  type BrConfig,
  type Classification,
  type GuessRow,
  type Mode,
  type RoundState,
} from "./types";

/** What the engine reads: the name index and entities (shared with Silhouette) and the playing graph. */
export type BrWorld = { world: World; graph: Graph };

export function startRound(
  w: BrWorld,
  opts: { a: string; b: string; mode: Mode; config: BrConfig },
): RoundState {
  const len = pathLength(w.graph, opts.a, opts.b);
  if (len === null || len < 2)
    throw new RangeError(`${opts.a} to ${opts.b} is not a playable route`);
  return {
    a: opts.a,
    b: opts.b,
    mode: opts.mode,
    config: opts.config,
    m: len - 1,
    status: "routing",
    guesses: [],
    hints: [],
    gaveUp: false,
  };
}

/** L, the number of borders on a shortest route. */
export const routeLength = (s: RoundState): number => s.m + 1;

/** Normal budget is m + 4; Practice has none (border-run §2). */
export const budget = (s: RoundState): number | null =>
  s.mode === "practice" ? null : s.m + EXTRA_GUESSES;

export const guessesLeft = (s: RoundState): number | null => {
  const b = budget(s);
  return b === null ? null : Math.max(0, b - s.guesses.length);
};

/** Feedback tiers (border-run §7): on a shortest route, one hop longer, or anything else. */
export function classify(w: BrWorld, s: RoundState, id: string): Classification {
  const da = distances(w.graph, s.a).get(id);
  const db = distances(w.graph, s.b).get(id);
  if (da === undefined || db === undefined) return "off-route";
  const sum = da + db;
  const len = routeLength(s);
  return sum === len ? "on-route" : sum === len + 1 ? "near" : "off-route";
}

/** Countries on the map: both endpoints and every guess. */
export const revealed = (s: RoundState): Set<string> =>
  new Set([s.a, s.b, ...s.guesses.map((g) => g.entityId)]);

/** True when revealed countries contain a connected path from A to B (border-run §2.4). */
export const isConnected = (w: BrWorld, s: RoundState): boolean =>
  component(w.graph, s.a, revealed(s)).has(s.b);

/** The connected groups of revealed countries, for the text list view (border-run §10). A's and B's groups first. */
export function groups(w: BrWorld, s: RoundState): string[][] {
  const left = revealed(s);
  const out: string[][] = [];
  for (const start of [s.a, s.b, ...[...left].sort()]) {
    if (!left.has(start)) continue;
    const comp = component(w.graph, start, left);
    for (const id of comp) left.delete(id);
    out.push([...comp].sort());
  }
  return out;
}

export type GuessEvent =
  | { kind: "ignored" }
  | { kind: "not-recognized" }
  | { kind: "try-english" }
  | { kind: "already-guessed"; entityId: string }
  | { kind: "on-map"; entityId: string }
  | { kind: "ambiguous"; message: string }
  | { kind: "round-over" }
  | { kind: "accepted"; row: GuessRow };

function context(w: BrWorld, s: RoundState): MatchContext {
  const all = new Set(w.graph.keys());
  return {
    mode: "type_prompted",
    remaining: all,
    promptAnswers: all,
    inQuiz: all,
    strictness: "standard",
    named: new Set([s.a, s.b, ...s.guesses.map((g) => g.entityId)]),
  };
}

export function append(w: BrWorld, s: RoundState, row: GuessRow): RoundState {
  const next: RoundState = { ...s, guesses: [...s.guesses, row] };
  if (isConnected(w, next)) return { ...next, status: "won" };
  const b = budget(next);
  return b !== null && next.guesses.length >= b ? { ...next, status: "lost" } : next;
}

/**
 * Submits typed text (Enter). Invalid names, repeats, the endpoints and ambiguous names consume nothing
 * (AC-BR-005, 006). Pure: returns the next state and what happened.
 */
export function submitGuess(
  w: BrWorld,
  s: RoundState,
  input: string,
): { state: RoundState; event: GuessEvent } {
  if (s.status !== "routing") return { state: s, event: { kind: "round-over" } };
  const r = w.world.index.match(input, context(w, s), { submitted: true });
  switch (r.kind) {
    case "ignore":
      return { state: s, event: { kind: "ignored" } };
    case "try-english":
      return { state: s, event: { kind: "try-english" } };
    case "not-recognized":
    case "not-in-quiz":
      return { state: s, event: { kind: "not-recognized" } };
    case "ambiguous":
      return { state: s, event: { kind: "ambiguous", message: r.message } };
    case "already-named":
      return { state: s, event: afterNamed(s, r.entityId) };
    case "accept":
    case "wrong":
    case "hold":
      return guessEntity(w, s, r.entityId, input, r.kind === "accept" ? r.notes : []);
  }
}

const afterNamed = (s: RoundState, entityId: string): GuessEvent =>
  entityId === s.a || entityId === s.b
    ? { kind: "on-map", entityId }
    : { kind: "already-guessed", entityId };

/** Submits an entity directly (picking a suggestion). */
export function guessEntity(
  w: BrWorld,
  s: RoundState,
  entityId: string,
  input = "",
  notes: readonly ("former-name" | "spelling-corrected")[] = [],
): { state: RoundState; event: GuessEvent } {
  if (s.status !== "routing") return { state: s, event: { kind: "round-over" } };
  if (!w.graph.has(entityId)) return { state: s, event: { kind: "not-recognized" } };
  if (revealed(s).has(entityId)) return { state: s, event: afterNamed(s, entityId) };
  const note = notes.includes("spelling-corrected")
    ? ("spelling-corrected" as const)
    : notes.includes("former-name")
      ? ("former-name" as const)
      : undefined;
  const row: GuessRow = {
    entityId,
    input,
    cls: classify(w, s, entityId),
    ...(note ? { note } : {}),
  };
  return { state: append(w, s, row), event: { kind: "accepted", row } };
}

/** Give up: the round is lost and a shortest route is revealed. */
export const giveUp = (s: RoundState): RoundState =>
  s.status === "routing" ? { ...s, status: "lost", gaveUp: true } : s;
