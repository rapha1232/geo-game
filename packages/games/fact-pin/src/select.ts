import { makeRng, type Rng } from "@meridian/game-kit";
import type { Difficulty, FactPinConfig, PinFact } from "./types";

/** Facts that may be asked under a configuration (fact-pin §6.2): published, in the chosen categories and eras, by difficulty. */
export function eligibleFacts(facts: readonly PinFact[], c: FactPinConfig): PinFact[] {
  return facts.filter(
    (f) =>
      f.status === "published" &&
      (c.categories.length === 0 || c.categories.includes(f.category)) &&
      (c.eras.length === 0 || c.eras.includes(f.era)) &&
      (c.difficulty !== "easy" || (f.difficulty < 0.4 && f.precision !== "exact")),
  );
}

const weightOf = (f: PinFact, d: Difficulty): number =>
  d === "hard" && f.difficulty > 0.5 ? 3 : 1;

export type SeenState = {
  /** Fact ids the player has seen, oldest first. */
  seen: string[];
};

export type Draw = {
  ids: string[];
  seen: string[];
  /** Set when old facts were let back in. */ recycled: boolean;
};

/**
 * Draws facts for a run (fact-pin §11). Facts in the seen set are ineligible; once 80% of the eligible pool has been
 * seen, the oldest half of the seen set becomes eligible again. Within a run: at most 2 per continent, at most 2 per
 * category (when the config allows all categories), and no shared `entities`. Those limits relax only if the pool
 * cannot meet them. `excluded` (recent dailies) is never drawn unless nothing else is left.
 */
export function drawRun(
  pool: readonly PinFact[],
  c: FactPinConfig,
  seen: readonly string[],
  count: number,
  rng: Rng,
  excluded: ReadonlySet<string> = new Set(),
): Draw {
  const inPool = new Set(pool.map((f) => f.id));
  let seenList = seen.filter((id) => inPool.has(id));
  let recycled = false;
  if (pool.length > 0 && seenList.length >= Math.ceil(0.8 * pool.length)) {
    seenList = seenList.slice(Math.ceil(seenList.length / 2));
    recycled = true;
  }
  const seenSet = new Set(seenList);
  const chosen: PinFact[] = [];
  const perContinent = new Map<string, number>();
  const perCategory = new Map<string, number>();
  const used = new Set<string>();
  const allCategories = c.categories.length === 0;

  const ok = (f: PinFact, level: number): boolean => {
    if (chosen.some((x) => x.id === f.id)) return false;
    if (level < 3 && f.entities.some((e) => used.has(e))) return false;
    if (level < 2 && (perContinent.get(f.continent) ?? 0) >= 2) return false;
    if (level < 1 && allCategories && (perCategory.get(f.category) ?? 0) >= 2) return false;
    return true;
  };

  for (let n = 0; n < count; n++) {
    let pick: PinFact | undefined;
    for (const level of [0, 1, 2, 3]) {
      for (const pass of [0, 1, 2]) {
        // pass 0: unseen and not excluded; pass 1: unseen; pass 2: anything.
        const candidates = pool.filter(
          (f) =>
            ok(f, level) && (pass >= 2 || !seenSet.has(f.id)) && (pass >= 1 || !excluded.has(f.id)),
        );
        if (candidates.length === 0) continue;
        pick = candidates[rng.weightedIndex(candidates.map((f) => weightOf(f, c.difficulty)))];
        break;
      }
      if (pick) break;
    }
    if (!pick) break;
    chosen.push(pick);
    for (const e of pick.entities) used.add(e);
    perContinent.set(pick.continent, (perContinent.get(pick.continent) ?? 0) + 1);
    perCategory.set(pick.category, (perCategory.get(pick.category) ?? 0) + 1);
  }
  const ids = chosen.map((f) => f.id);
  return {
    ids,
    seen: [...seenList, ...ids.filter((id) => !seenSet.has(id))].slice(-2000),
    recycled,
  };
}

/** A seeded run: `seed + config → fact ids`, the same for everyone (AC-FP-015). The Repeat Guard does not apply. */
export function seededRun(pool: readonly PinFact[], c: FactPinConfig, seed: string): string[] {
  const rng = makeRng(seed, "fact-pin", {
    cats: c.categories,
    eras: c.eras,
    d: c.difficulty,
    n: c.runLength,
  });
  return drawRun(eligibleFacts(pool, c), c, [], c.runLength, rng.fork("run")).ids;
}
