import { Rng } from "@meridian/game-kit";
import type { DailySchedule } from "@meridian/schemas";

/** Silhouette daily rules (silhouette §11). */
export const NO_REPEAT_DAYS = 150;
export const SMALL_KM2 = 5000;
export const SMOOTH_WINDOW = 7;
export const SMOOTH_TOLERANCE = 0.1;

export type DailyCandidate = { id: string; continent: string; areaKm2: number; shape: number };

const DAY_MS = 86_400_000;
export const addDays = (date: string, n: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const diffDays = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Extends a Silhouette daily schedule to `to` (inclusive). Deterministic: the same pool, history and seed give the
 * same days. Each day is drawn at random from the targets that keep every rule:
 * no repeat within 150 days, not the previous day's continent, at most one entity under 5,000 km² in any 7 days,
 * and every full 7-day window's mean `shape` within ±0.1 of the pool's mean. If the difficulty rule leaves nothing,
 * it is relaxed for that day only; the others never are (and the validator still reports it).
 */
export function extendSchedule(opts: {
  pool: readonly DailyCandidate[];
  existing?: DailySchedule | undefined;
  from: string;
  to: string;
  seed: string;
}): DailySchedule {
  const byId = new Map(opts.pool.map((c) => [c.id, c] as const));
  const days: Record<string, string[]> = { ...(opts.existing?.days ?? {}) };
  const first = opts.existing?.from ?? opts.from;
  const poolMean = mean(opts.pool.map((c) => c.shape));
  const rng = new Rng(`${opts.seed}|silhouette-daily`);
  let date = opts.existing ? addDays(opts.existing.to, 1) : opts.from;
  for (; date <= opts.to; date = addDays(date, 1)) {
    const prior: string[] = [];
    for (let i = 1; i <= NO_REPEAT_DAYS; i++) {
      const id = days[addDays(date, -i)]?.[0];
      if (id !== undefined) prior.push(id);
    }
    const yesterday =
      prior[0] !== undefined && days[addDays(date, -1)] ? byId.get(prior[0]) : undefined;
    const recent = prior.slice(0, SMOOTH_WINDOW - 1).map((id) => byId.get(id)) as (
      DailyCandidate | undefined
    )[];
    const used = new Set(prior);
    const base = opts.pool.filter(
      (c) =>
        !used.has(c.id) &&
        c.continent !== yesterday?.continent &&
        !(c.areaKm2 < SMALL_KM2 && recent.some((r) => r !== undefined && r.areaKm2 < SMALL_KM2)),
    );
    const smooth = base.filter((c) => {
      if (recent.length < SMOOTH_WINDOW - 1 || recent.some((r) => r === undefined)) return true;
      const w = [c.shape, ...recent.map((r) => (r as DailyCandidate).shape)];
      return Math.abs(mean(w) - poolMean) <= SMOOTH_TOLERANCE;
    });
    const choices = smooth.length > 0 ? smooth : base;
    if (choices.length === 0) throw new Error(`${date}: no target satisfies the daily rules`);
    // Look one day ahead: the six days ending today should sit near the pool mean, or tomorrow's window may have no fit.
    const tail = recent.slice(0, SMOOTH_WINDOW - 2).map((r) => r?.shape ?? poolMean);
    const lean = (c: DailyCandidate): number => Math.abs(mean([c.shape, ...tail]) - poolMean);
    const ranked = [...choices].sort((a, b) => lean(a) - lean(b) || a.id.localeCompare(b.id));
    days[date] = [rng.pick(ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)))).id];
  }
  return {
    game: "silhouette",
    from: first,
    to: opts.to < first ? first : opts.to,
    days,
  } as DailySchedule;
}

/** The ids scheduled for a date, or undefined past the end of the schedule. */
export const targetFor = (schedule: DailySchedule, date: string): string | undefined =>
  schedule.days[date]?.[0];

export const daysBetween = diffDays;

/**
 * Fact Pin daily rules (fact-pin §11), with one deviation: the no-repeat window is 14 days, not 365. The curated bank
 * has about 23 facts per category and a day uses one per category, so a year-long window is infeasible until the bank
 * grows (see content/facts/README.md). The spec is updated in the same change.
 */
export const FACT_PIN_NO_REPEAT_DAYS = 14;
export const DAILY_CATEGORIES = ["history", "nature", "culture", "science", "sport"] as const;

export type FactPinCandidate = { id: string; category: string; continent: string };

/**
 * Extends the Fact Pin daily schedule to `to` (inclusive): five facts a day, one from each category, from five
 * different continents, none repeated within the window. Deterministic for the same pool, history and seed.
 */
export function extendFactPinSchedule(opts: {
  pool: readonly FactPinCandidate[];
  existing?: DailySchedule | undefined;
  from: string;
  to: string;
  seed: string;
  window?: number;
}): DailySchedule {
  const window = opts.window ?? FACT_PIN_NO_REPEAT_DAYS;
  const days: Record<string, string[]> = { ...(opts.existing?.days ?? {}) };
  const first = opts.existing?.from ?? opts.from;
  const rng = new Rng(`${opts.seed}|fact-pin-daily`);
  let date = opts.existing ? addDays(opts.existing.to, 1) : opts.from;
  for (; date <= opts.to; date = addDays(date, 1)) {
    const used = new Set<string>();
    for (let i = 1; i <= window; i++) for (const id of days[addDays(date, -i)] ?? []) used.add(id);
    const byCategory = DAILY_CATEGORIES.map((c) =>
      opts.pool.filter((f) => f.category === c && !used.has(f.id)),
    );
    let picked: string[] | null = null;
    // Random order within each category; backtrack over continents so the five are all different.
    const shuffled = byCategory.map((list) => rng.shuffle([...list]));
    const place = (i: number, continents: Set<string>, ids: string[]): string[] | null => {
      if (i === shuffled.length) return ids;
      for (const f of shuffled[i] as FactPinCandidate[]) {
        if (continents.has(f.continent)) continue;
        const got = place(i + 1, new Set([...continents, f.continent]), [...ids, f.id]);
        if (got) return got;
      }
      return null;
    };
    picked = place(0, new Set(), []);
    if (!picked) throw new Error(`${date}: no five facts satisfy the Fact Pin daily rules`);
    days[date] = picked;
  }
  return {
    game: "fact-pin",
    from: first,
    to: opts.to < first ? first : opts.to,
    days,
  } as DailySchedule;
}
