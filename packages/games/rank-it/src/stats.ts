import type { RankEntity, RankWorld, StatDef, StatValues } from "./types";

export function buildWorld(
  entities: readonly RankEntity[],
  stats: readonly StatDef[],
  values: StatValues,
): RankWorld {
  return {
    entities,
    byId: new Map(entities.map((e) => [e.id, e])),
    stats,
    statById: new Map(stats.map((s) => [s.id, s])),
    values,
  };
}

export const valueOf = (w: RankWorld, stat: string, id: string): number | undefined =>
  w.values[stat]?.[id]?.[0];

/** Whether two values differ enough to rank without ties or data-year noise (rank-it §5). */
export function separated(def: StatDef, a: number, b: number, factor = 1): boolean {
  if ("absolute" in def.separation) return Math.abs(a - b) >= def.separation.absolute * factor;
  const top = Math.max(Math.abs(a), Math.abs(b));
  return top > 0 && Math.abs(a - b) / top >= def.separation.relative * factor;
}

/** Entities that have a value for the statistic and sit in the scope, ranked highest first (ties by id). */
export function ranked(w: RankWorld, stat: string, scope: string): { id: string; value: number }[] {
  return w.entities
    .filter((e) => scope === "world" || e.continent === scope)
    .flatMap((e) => {
      const v = valueOf(w, stat, e.id);
      return v === undefined ? [] : [{ id: e.id, value: v }];
    })
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
}

/** The footer text's year range, e.g. "2022–2024" (rank-it §9). */
export function yearRange(w: RankWorld, stat: string, ids: readonly string[]): string | null {
  const years = ids.flatMap((id) => {
    const y = w.values[stat]?.[id]?.[1];
    return y === null || y === undefined ? [] : [y];
  });
  if (years.length === 0) return null;
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

/** Bars go on a log scale when the largest value is more than 100 times the smallest (AC-RK-010). */
export function useLogScale(values: readonly number[]): boolean {
  const positive = values.filter((v) => v > 0);
  if (positive.length < 2 || positive.length !== values.length) return false;
  return Math.max(...positive) / Math.min(...positive) > 100;
}
