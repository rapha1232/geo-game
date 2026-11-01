import type { Prompt } from "@meridian/deep-cut";
import type { QuizWorld } from "@meridian/quiz";
import { assembleQuiz, loadQuizPacks } from "../quiz/data";

export type LoadedDeepCut = {
  world: QuizWorld;
  prompts: readonly Prompt[];
  byId: ReadonlyMap<string, Prompt>;
  labelPoints: ReadonlyMap<string, readonly [number, number]>;
};

/** The country names (for typing and the map) and the prompt pack. */
export async function loadDeepCut(loader: {
  pack<T>(name: string, version?: string): Promise<T>;
}): Promise<LoadedDeepCut> {
  const [{ packs, edges }, prompts] = await Promise.all([
    loadQuizPacks(loader),
    loader.pack<{ prompts: Prompt[] }>("deepcut.prompts"),
  ]);
  const quiz = assembleQuiz(packs, edges);
  return {
    world: quiz.world,
    prompts: prompts.prompts,
    byId: new Map(prompts.prompts.map((p) => [p.id, p])),
    labelPoints: quiz.facts.labelPoints,
  };
}
