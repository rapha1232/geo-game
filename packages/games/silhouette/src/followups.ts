import type { Rng } from "@meridian/game-kit";
import type { FollowUpKind, SilEntity } from "./types";
import type { World } from "./world";

export type FollowUp = {
  kind: FollowUpKind;
  targetId: string;
  /** Capital names, or entity ids whose flags are shown. */
  options: string[];
  correctIndex: number;
};

/**
 * Follow-up prompts (silhouette §8.2): four options, one attempt. Capital distractors are capitals of other
 * entities on the same continent, flag distractors are entities whose flags are confused with the target's
 * first, then others on the same continent. Fills from elsewhere if a continent is too small.
 */
export function followUp(world: World, kind: FollowUpKind, targetId: string, rng: Rng): FollowUp {
  const t = world.byId.get(targetId) as SilEntity;
  const others = world.entities.filter((e) => e.id !== t.id && e.type === "country");
  const sameContinent = others.filter((e) => e.continent === t.continent);
  const ordered = [
    ...(kind === "flag"
      ? (t.confusables ?? []).map((id) => world.byId.get(id)).filter((e): e is SilEntity => !!e)
      : []),
    ...rng.fork(`${kind}:near`).shuffle(sameContinent),
    ...rng.fork(`${kind}:far`).shuffle(others.filter((e) => e.continent !== t.continent)),
  ];
  const seen = new Set<string>();
  const distractors: string[] = [];
  const correct = kind === "capital" ? (t.capitals[0] as string) : t.id;
  const taken = new Set(kind === "capital" ? t.capitals : [t.id]);
  for (const e of ordered) {
    const value = kind === "capital" ? e.capitals[0] : e.id;
    if (!value || taken.has(value) || seen.has(value)) continue;
    seen.add(value);
    distractors.push(value);
    if (distractors.length === 3) break;
  }
  const options = rng.fork(`${kind}:order`).shuffle([correct, ...distractors]);
  return { kind, targetId, options, correctIndex: options.indexOf(correct) };
}

export const answerFollowUp = (f: FollowUp, choice: number): boolean => choice === f.correctIndex;
