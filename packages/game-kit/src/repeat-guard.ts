import type { Rng } from "./prng";

/** Repeat Guard (ARCHITECTURE §8.2). Pure: history is passed in and returned. */

export const HISTORY_CAP = 500;

export type RepeatRules = {
  /** Exclude the last N targets. */
  windowSize: number | ((poolSize: number) => number);
  /** Stricter windows for matching ids, e.g. small countries: 7. */
  extraWindows?: { predicate: (id: string) => boolean; size: number }[];
  /** Weight multipliers relative to the previous target, e.g. same continent ×0.3. */
  downWeight?: { predicate: (id: string, prev: string) => boolean; factor: number }[];
  relax: "halve-window" | "reset-oldest-half";
};

/** Most recent first is NOT assumed: history is oldest → newest, capped at HISTORY_CAP. */
export type RepeatHistory = readonly string[];

export type Selection = {
  id: string;
  /** True when the rules had to be relaxed to find an eligible target. */
  guardRelaxed: boolean;
  history: RepeatHistory;
};

export const pushHistory = (history: RepeatHistory, id: string): RepeatHistory =>
  [...history, id].slice(-HISTORY_CAP);

/** Silhouette default: W = min(100, floor(poolSize × 0.5)). */
export const halfPoolWindow = (poolSize: number): number =>
  Math.min(100, Math.floor(poolSize * 0.5));

function eligible(
  pool: readonly string[],
  history: RepeatHistory,
  w: number,
  rules: RepeatRules,
  scale: number,
): string[] {
  const recent = new Set(history.slice(Math.max(0, history.length - w)));
  const extras = (rules.extraWindows ?? []).map((e) => ({
    pred: e.predicate,
    set: new Set(history.slice(Math.max(0, history.length - Math.floor(e.size * scale)))),
  }));
  return pool.filter((id) => !recent.has(id) && !extras.some((e) => e.pred(id) && e.set.has(id)));
}

/** Select the next target. Never fails for a non-empty pool. */
export function selectNext(
  pool: readonly string[],
  history: RepeatHistory,
  rng: Rng,
  rules: RepeatRules,
): Selection {
  if (pool.length === 0) throw new RangeError("selectNext: empty pool");
  let w = typeof rules.windowSize === "function" ? rules.windowSize(pool.length) : rules.windowSize;
  let scale = 1;
  let list = eligible(pool, history, w, rules, scale);
  let relaxed = false;
  let nextHistory = history;
  while (list.length === 0) {
    relaxed = true;
    if (rules.relax === "halve-window") {
      w = Math.floor(w / 2);
      scale /= 2;
    } else {
      // Forget the oldest half of the active window.
      const cut = Math.ceil(Math.min(w, nextHistory.length) / 2);
      const start = Math.max(0, nextHistory.length - w);
      nextHistory = [...nextHistory.slice(0, start), ...nextHistory.slice(start + cut)];
    }
    list = eligible(pool, nextHistory, w, rules, scale);
    if (w === 0 && list.length === 0) list = pool.slice();
  }
  const prev = nextHistory[nextHistory.length - 1];
  const weights = list.map((id) => {
    let weight = 1;
    if (prev !== undefined) {
      for (const d of rules.downWeight ?? []) if (d.predicate(id, prev)) weight *= d.factor;
    }
    return weight;
  });
  const id = list[rng.weightedIndex(weights)] as string;
  return { id, guardRelaxed: relaxed, history: pushHistory(nextHistory, id) };
}

/**
 * A sequence of `count` targets. Seeded challenges and dailies pass an empty `history`, so the result is
 * identical for everyone, with the rules applied within the sequence only.
 */
export function selectSequence(
  pool: readonly string[],
  count: number,
  history: RepeatHistory,
  rng: Rng,
  rules: RepeatRules,
): { ids: string[]; guardRelaxed: boolean; history: RepeatHistory } {
  const ids: string[] = [];
  let h = history;
  let relaxed = false;
  for (let i = 0; i < count; i++) {
    const s = selectNext(pool, h, rng, rules);
    ids.push(s.id);
    h = s.history;
    relaxed ||= s.guardRelaxed;
  }
  return { ids, guardRelaxed: relaxed, history: h };
}
