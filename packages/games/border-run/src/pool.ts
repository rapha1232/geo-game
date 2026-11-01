import { selectNext, type RepeatHistory, type Rng } from "@meridian/game-kit";
import { distances, type Graph } from "./graph";
import { M_RANGE, type BrConfig } from "./types";

/** Pair ids are `a|b` with a < b, so a pair is the same pair in either direction. */
export const pairId = (x: string, y: string): string => (x < y ? `${x}|${y}` : `${y}|${x}`);
export const splitPair = (id: string): [string, string] => {
  const [a, b] = id.split("|") as [string, string];
  return [a, b];
};

export const PAIR_WINDOW = 200;
export const ENDPOINT_WINDOW = 5;

/**
 * Every pair in one connected component whose minimum intermediate count m = L − 1 lies in the configured range
 * and whose endpoints both sit in the region (border-run §3, §4). Isolated nodes never appear, so island countries
 * are never endpoints while crossings are off (AC-BR-008). Sorted, so the pool is the same everywhere.
 */
export function pairPool(
  graph: Graph,
  config: BrConfig,
  continentOf: (id: string) => string | undefined,
): string[] {
  const [lo, hi] = M_RANGE[config.route];
  const inRegion = (id: string): boolean =>
    config.region === "world" || continentOf(id) === config.region;
  const out: string[] = [];
  for (const a of [...graph.keys()].sort()) {
    if (!inRegion(a)) continue;
    for (const [b, d] of distances(graph, a)) {
      const m = d - 1;
      if (b > a && m >= lo && m <= hi && inRegion(b)) out.push(`${a}|${b}`);
    }
  }
  return out;
}

/**
 * Repeat Guard (border-run §11): no pair in the last 200 rounds and no endpoint used in the last 5, each relaxed
 * only when the pool would otherwise run dry. Returns the pair with a seeded direction, so the same seed always
 * gives the same A and B (AC-BR-011).
 */
export function selectPair(
  pool: readonly string[],
  history: RepeatHistory,
  rng: Rng,
): { a: string; b: string; id: string; history: RepeatHistory; guardRelaxed: boolean } {
  const recent = new Set(history.slice(-ENDPOINT_WINDOW).flatMap(splitPair));
  const fresh = pool.filter((p) => !splitPair(p).some((e) => recent.has(e)));
  const s = selectNext(fresh.length > 0 ? fresh : pool, history, rng, {
    windowSize: PAIR_WINDOW,
    relax: "halve-window",
  });
  const [x, y] = splitPair(s.id);
  const flip = rng.fork("direction").nextInt(2) === 1;
  return {
    a: flip ? y : x,
    b: flip ? x : y,
    id: s.id,
    history: s.history,
    guardRelaxed: s.guardRelaxed || fresh.length === 0,
  };
}
