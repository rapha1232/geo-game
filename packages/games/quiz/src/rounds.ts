import { Rng } from "@meridian/game-kit";
import type { QuizEntity } from "./types";
import type { QuizWorld } from "./world";

/** The two R2 round formats (quiz-library §2.2): select all tiles that match, and match two columns. */
export const TILE_COUNT = 24;
export const TILE_CORRECT = 9;
export const MATCH_PAIRS = 8;

export type RoundStatus = "playing" | "done" | "lives_out";

export type TileCriterion = { kind: "landlocked" } | { kind: "continent"; id: string };

export type TileRound = {
  kind: "tiles";
  criterion: TileCriterion;
  /** The 24 tiles (country ids) in display order. */
  tiles: string[];
  /** The tiles that match, sorted. */
  correct: string[];
  selected: string[];
  /** Lives left; absent when unlimited. */
  lives?: number;
  status: RoundStatus;
};

export type MatchRound = {
  kind: "match";
  /** Country ids; the country on the left pairs with its own capital on the right. */
  left: string[];
  right: string[];
  matched: string[];
  /** The country currently chosen on the left, waiting for a capital. */
  pending: string | null;
  mistakes: number;
  lives?: number;
  status: RoundStatus;
};

const sovereign = (w: QuizWorld): QuizEntity[] =>
  w.entities.filter((e) => e.type === "country" && e.sets.includes("sovereign-197"));

export const matchesCriterion = (e: QuizEntity, c: TileCriterion): boolean =>
  c.kind === "landlocked" ? e.landlocked === true : e.continent === c.id;

/**
 * A tile round: 24 countries, 9 of which match the criterion (fewer if the criterion has fewer members). Deterministic
 * for a seed.
 */
export function generateTileRound(
  w: QuizWorld,
  criterion: TileCriterion,
  seed: string,
  lives?: 1 | 3,
): TileRound {
  const rng = new Rng(`${seed}|tiles`);
  const pool = sovereign(w);
  const yes = pool.filter((e) => matchesCriterion(e, criterion)).map((e) => e.id);
  const no = pool.filter((e) => !matchesCriterion(e, criterion)).map((e) => e.id);
  const want = Math.min(TILE_CORRECT, yes.length);
  const correct = rng.shuffle(yes).slice(0, want).sort();
  const wrong = rng.shuffle(no).slice(0, TILE_COUNT - want);
  if (correct.length === 0 || wrong.length < TILE_COUNT - want)
    throw new RangeError("not enough countries for a tile round");
  return {
    kind: "tiles",
    criterion,
    tiles: rng.shuffle([...correct, ...wrong]),
    correct,
    selected: [],
    ...(lives ? { lives } : {}),
    status: "playing",
  };
}

const loseLife = <R extends TileRound | MatchRound>(r: R): R => {
  if (r.lives === undefined) return r;
  const lives = Math.max(0, r.lives - 1);
  return { ...r, lives, status: lives === 0 ? "lives_out" : r.status };
};

/** Selects or unselects a tile. Selecting a tile that does not match costs a life. */
export function toggleTile(r: TileRound, id: string): TileRound {
  if (r.status !== "playing" || !r.tiles.includes(id)) return r;
  if (r.selected.includes(id)) return { ...r, selected: r.selected.filter((x) => x !== id) };
  const next = { ...r, selected: [...r.selected, id] };
  return r.correct.includes(id) ? next : loseLife(next);
}

export const finishTiles = (r: TileRound): TileRound =>
  r.status === "playing" ? { ...r, status: "done" } : r;

/** (right picks − wrong picks) ÷ matching tiles, at least 0 (quiz-library §2.2). */
export function tileScore(r: TileRound): number {
  const right = r.selected.filter((id) => r.correct.includes(id)).length;
  const wrong = r.selected.length - right;
  return Math.max(0, (right - wrong) / r.correct.length);
}

/** Every matching tile is selected: the player can finish early. */
export const allFound = (r: TileRound): boolean => r.correct.every((id) => r.selected.includes(id));

/** Eight countries with a single, distinct capital, so each pair has one right answer. Deterministic for a seed. */
export function generateMatchRound(w: QuizWorld, seed: string, lives?: 1 | 3): MatchRound {
  const rng = new Rng(`${seed}|match`);
  const names = new Map<string, number>();
  for (const e of sovereign(w))
    if (e.capitals[0]) names.set(e.capitals[0].name, (names.get(e.capitals[0].name) ?? 0) + 1);
  const usable = sovereign(w).filter((e) => e.capitals[0] && names.get(e.capitals[0].name) === 1);
  const pick = rng.shuffle(usable).slice(0, MATCH_PAIRS);
  if (pick.length < MATCH_PAIRS) throw new RangeError("not enough countries for a match round");
  const ids = pick.map((e) => e.id);
  return {
    kind: "match",
    left: rng.fork("left").shuffle(ids),
    right: rng.fork("right").shuffle(ids),
    matched: [],
    pending: null,
    mistakes: 0,
    ...(lives ? { lives } : {}),
    status: "playing",
  };
}

/**
 * The player picks a country (left) or a capital (right). With a country waiting, a capital either completes the pair
 * or flashes and unpairs, counting a mistake (and a life when lives are on).
 */
export function pickMatch(
  r: MatchRound,
  side: "left" | "right",
  id: string,
): { round: MatchRound; result: "pending" | "paired" | "wrong" | "ignored" } {
  if (r.status !== "playing" || r.matched.includes(id)) return { round: r, result: "ignored" };
  if (side === "left") {
    if (!r.left.includes(id)) return { round: r, result: "ignored" };
    return { round: { ...r, pending: r.pending === id ? null : id }, result: "pending" };
  }
  if (r.pending === null || !r.right.includes(id)) return { round: r, result: "ignored" };
  if (r.pending === id) {
    const matched = [...r.matched, id];
    return {
      round: {
        ...r,
        matched,
        pending: null,
        status: matched.length === MATCH_PAIRS ? "done" : "playing",
      },
      result: "paired",
    };
  }
  return {
    round: loseLife({ ...r, pending: null, mistakes: r.mistakes + 1 }),
    result: "wrong",
  };
}

/** Each wrong pairing costs one of the eight points, at least 0. */
export const matchScore = (r: MatchRound): number =>
  Math.max(0, (MATCH_PAIRS - r.mistakes) / MATCH_PAIRS);

/** Whatever the round, whether it is over. */
export const roundOver = (r: TileRound | MatchRound): boolean => r.status !== "playing";
