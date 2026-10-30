import { MASTERY_WEAK_BELOW } from "@meridian/game-kit";
import { generateQuiz, skillFor, type QuizHistory } from "./generate";
import type { Quiz, QuizConfig, QuizState, Skill } from "./types";
import type { QuizWorld } from "./world";

/** What the player's local mastery record says about one entity and skill. */
export type MasteryRow = { entityId: string; skill: string; mastery: number; dueAt: number };

export type PracticePlan = { ids: string[]; weak: number; added: number };

export const MIN_PRACTICE_ITEMS = 5;

/**
 * Practice my misses (quiz-library §11.3): entities below mastery 0.6 for this skill, most overdue first, padded to at
 * least 5 with the next-weakest items. `added` is how many near-misses were added, for the notice.
 */
export function practicePlan(
  rows: readonly MasteryRow[],
  skill: Skill,
  candidates: readonly string[],
): PracticePlan {
  const inPool = new Set(candidates);
  const mine = rows.filter((r) => r.skill === skill && inPool.has(r.entityId));
  const weak = mine
    .filter((r) => r.mastery < MASTERY_WEAK_BELOW)
    .sort((a, b) => a.dueAt - b.dueAt || a.entityId.localeCompare(b.entityId));
  const ids = weak.map((r) => r.entityId);
  let added = 0;
  if (ids.length < MIN_PRACTICE_ITEMS) {
    const rest = mine
      .filter((r) => r.mastery >= MASTERY_WEAK_BELOW)
      .sort((a, b) => a.mastery - b.mastery || a.entityId.localeCompare(b.entityId));
    for (const r of rest) {
      if (ids.length >= MIN_PRACTICE_ITEMS) break;
      ids.push(r.entityId);
      added++;
    }
    // Entities never played count as unknown: they fill the rest, in a stable order.
    const seen = new Set(ids);
    for (const id of [...candidates].sort()) {
      if (ids.length >= MIN_PRACTICE_ITEMS) break;
      if (!seen.has(id)) {
        ids.push(id);
        added++;
      }
    }
  }
  return { ids, weak: weak.length, added };
}

/**
 * A practice quiz over exactly the planned items. Reuses the generator for prompts and distractors, then restricts the
 * item list, so every format and template works the same way.
 */
export function generatePractice(
  world: QuizWorld,
  config: QuizConfig,
  seed: string,
  plan: PracticePlan,
  history: QuizHistory = [],
): Quiz {
  const base = generateQuiz(world, { ...config, count: "all", timed: config.timed }, seed, history);
  const want = new Set(plan.ids);
  const items = base.items.filter((it) => want.has(it.id));
  return {
    ...base,
    config: { ...config, count: items.length },
    items,
    limitMs:
      base.limitMs === null
        ? null
        : Math.ceil((items.length * (base.limitMs / Math.max(1, base.items.length))) / 15000) *
          15000,
  };
}

export type MasteryOutcome = {
  entityId: string;
  skill: Skill;
  itemScore: number;
  correct: boolean;
};

/**
 * Mastery inputs from a finished quiz: one per answered or missed item. Learn mode only marks items seen (no score), so
 * it reports nothing here.
 */
export function masteryOutcomes(s: QuizState): MasteryOutcome[] {
  if (s.quiz.config.learn) return [];
  const skill = skillFor(s.quiz.config.template, s.quiz.config.format);
  return s.items.flatMap((it, i) => {
    const item = s.quiz.items[i];
    // Continents and subregions have no mastery record of their own: only country items feed the map.
    if (!item || !/^(country|territory):/.test(item.id) || it.status === "pending") return [];
    return [{ entityId: item.id, skill, itemScore: it.score, correct: it.status === "correct" }];
  });
}
