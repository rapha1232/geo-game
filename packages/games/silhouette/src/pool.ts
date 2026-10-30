import {
  halfPoolWindow,
  selectNext,
  selectSequence,
  type RepeatHistory,
  type RepeatRules,
  type Rng,
} from "@meridian/game-kit";
import type { Difficulty, SilEntity } from "./types";
import type { World } from "./world";

export type PoolSpec =
  | { kind: "sovereign-197" }
  | { kind: "un-193" }
  | { kind: "sovereign+territories" }
  | { kind: "continent"; continent: string };

export const SMALL_KM2 = 5000;
const EASY_SHAPE_BELOW = 0.45;

/** Target pool (silhouette §3, §6.2). Easy keeps only the most recognizable shapes. */
export function targetPool(world: World, spec: PoolSpec, difficulty: Difficulty): string[] {
  const inPool = (e: SilEntity): boolean => {
    switch (spec.kind) {
      case "sovereign-197":
        return e.sets.includes("sovereign-197");
      case "un-193":
        return e.sets.includes("un-193");
      case "sovereign+territories":
        return e.sets.includes("sovereign-197") || e.type === "territory";
      case "continent":
        return e.sets.includes("sovereign-197") && e.continent === spec.continent;
    }
  };
  return world.entities
    .filter((e) => inPool(e) && (difficulty !== "easy" || e.shape < EASY_SHAPE_BELOW))
    .map((e) => e.id)
    .sort();
}

/**
 * Repeat Guard rules (silhouette §11): a window of min(100, half the pool), small entities not again within 7 rounds,
 * entities on the previous round's continent down-weighted ×0.3, and on Hard small entities weighted ×2.
 */
export function repeatRules(world: World, difficulty: Difficulty): RepeatRules {
  const small = (id: string): boolean => (world.byId.get(id)?.areaKm2 ?? Infinity) < SMALL_KM2;
  return {
    windowSize: halfPoolWindow,
    extraWindows: [{ predicate: small, size: 7 }],
    downWeight: [
      {
        predicate: (id, prev) => world.byId.get(id)?.continent === world.byId.get(prev)?.continent,
        factor: 0.3,
      },
      ...(difficulty === "hard" ? [{ predicate: (id: string) => small(id), factor: 2 }] : []),
    ],
    relax: "halve-window",
  };
}

export const selectTarget = (
  world: World,
  pool: readonly string[],
  difficulty: Difficulty,
  history: RepeatHistory,
  rng: Rng,
) => selectNext(pool, history, rng, repeatRules(world, difficulty));

/** A seeded challenge: the rules apply within the challenge only, so a link is identical for everyone. */
export const selectChallenge = (
  world: World,
  pool: readonly string[],
  difficulty: Difficulty,
  count: number,
  rng: Rng,
) => selectSequence(pool, count, [], rng, repeatRules(world, difficulty));
