import { makeRng, type Rng } from "@meridian/game-kit";
import { CONTINENT_NAMES, countryPool, inScope, inSet, universeOf, type QuizWorld } from "./world";
import { timeLimitMs } from "./limits";
import type {
  Difficulty,
  Prompt,
  Quiz,
  QuizConfig,
  QuizEntity,
  QuizItem,
  Skill,
  Template,
} from "./types";

/** Formats each R1 template allows (quiz-library §4.2). */
export const ALLOWED_FORMATS: Record<Template, readonly QuizConfig["format"][]> = {
  "countries.by-name": ["TYPE_ALL", "TYPE_PROMPTED", "MAP_CLICK"],
  "capitals.by-country": ["TYPE_PROMPTED", "MULTIPLE_CHOICE", "TYPE_ALL"],
  "countries.by-capital": ["TYPE_PROMPTED", "MULTIPLE_CHOICE"],
  "flags.by-country": ["TYPE_PROMPTED", "MULTIPLE_CHOICE", "MAP_CLICK"],
  "continents.by-name": ["MAP_CLICK", "MULTIPLE_CHOICE", "TYPE_PROMPTED"],
  "regions.by-name": ["MAP_CLICK", "MULTIPLE_CHOICE"],
  "countries.by-continent": ["MULTIPLE_CHOICE"],
};

/** Which mastery skill an item exercises (quiz-library §6.3, §11). */
export function skillFor(template: Template, format: QuizConfig["format"]): Skill {
  if (template === "flags.by-country") return "flag";
  if (template === "capitals.by-country" || template === "countries.by-capital") return "capital";
  if (template === "continents.by-name" || template === "regions.by-name" || format === "MAP_CLICK")
    return "locate";
  return "recall";
}

const MC_OPTIONS = 4;

/** Weight of an item by difficulty prior and setting (quiz-library §6.3). */
function difficultyWeight(prior: number, setting: Difficulty): number {
  const band = prior < 0.4 ? 0 : prior <= 0.7 ? 1 : 2;
  const table: Record<Difficulty, [number, number, number]> = {
    easy: [3, 1, 0.3],
    normal: [1, 1, 1],
    hard: [0.3, 1, 3],
  };
  return table[setting][band];
}

/** Weighted sample without replacement, deterministic for a given rng. */
function sample<T>(items: readonly T[], weights: readonly number[], k: number, rng: Rng): T[] {
  const pool = items.map((item, i) => ({ item, w: weights[i] ?? 1 }));
  const out: T[] = [];
  while (out.length < k && pool.length > 0) {
    const i = rng.weightedIndex(pool.map((p) => p.w));
    out.push((pool.splice(i, 1)[0] as { item: T }).item);
  }
  return out;
}

/** Items of the last K instances of this template and scope, for down-weighting (quiz-library §11.2). */
export type QuizHistory = readonly (readonly string[])[];

const repeatWeight = 0.2;

/** `K = max(1, floor(pool / count) − 1)`. */
export const repeatWindow = (pool: number, count: number): number =>
  Math.max(1, Math.floor(pool / count) - 1);

function distractors(
  world: QuizWorld,
  correct: QuizEntity,
  pool: readonly QuizEntity[],
  difficulty: Difficulty,
  template: Template,
  rng: Rng,
): string[] {
  // Capitals can be shared by name across entities; a distractor must not show the right answer.
  const clash = (e: QuizEntity): boolean =>
    e.id === correct.id ||
    (template === "capitals.by-country" &&
      e.capitals.some((c) => correct.capitals.some((x) => x.name === c.name)));
  const all = world.entities.filter((e) => e.type === "country" && !clash(e));
  const sameContinent = all.filter((e) => e.continent === correct.continent);
  const other = all.filter((e) => e.continent !== correct.continent);
  const sameRegion = all.filter((e) => e.region?.id === correct.region?.id && e.region);
  const take = (list: readonly QuizEntity[], n: number, chosen: Set<string>): string[] => {
    const out: string[] = [];
    for (const e of rng.shuffle(list)) {
      if (out.length >= n) break;
      if (!chosen.has(e.id)) {
        chosen.add(e.id);
        out.push(e.id);
      }
    }
    return out;
  };
  const chosen = new Set<string>();
  let picks: string[] = [];
  if (difficulty === "easy") picks = take(other, 3, chosen);
  else if (difficulty === "normal")
    picks = [...take(sameContinent, 2, chosen), ...take(all, 1, chosen)];
  else {
    const confusables = (correct.confusables ?? [])
      .map((id) => world.byId.get(id))
      .filter((e): e is QuizEntity => !!e && !clash(e));
    picks = [...take(confusables, 3, chosen)];
    picks = [...picks, ...take(sameRegion, 3 - picks.length, chosen)];
  }
  // Fill from anywhere if a small scope or sparse data left too few.
  picks = [
    ...picks,
    ...take(sameContinent, 3 - picks.length, chosen),
    ...take(all, 3 - picks.length, chosen),
  ];
  void pool;
  return picks.slice(0, MC_OPTIONS - 1);
}

function groupOptions(
  world: QuizWorld,
  correct: string,
  kind: "continent" | "region",
  rng: Rng,
): string[] {
  const others = world.groups.filter((g) => g.kind === kind && g.id !== correct).map((g) => g.id);
  return rng.shuffle(others).slice(0, MC_OPTIONS - 1);
}

function itemFor(
  world: QuizWorld,
  c: QuizConfig,
  id: string,
  rng: Rng,
  pool: readonly QuizEntity[],
): QuizItem {
  const { template, format } = c;
  const e = world.byId.get(id);
  const group = world.groupById.get(id);
  const base = (prompt: Prompt, answerIds: string[], mapIds: string[]): QuizItem => ({
    id,
    prompt,
    answerIds,
    mapIds,
  });
  const withOptions = (item: QuizItem, optionIds: string[], correct: string): QuizItem => {
    const options = rng.shuffle([correct, ...optionIds]);
    return { ...item, options, correctIndex: options.indexOf(correct) };
  };
  const mc = format === "MULTIPLE_CHOICE";
  switch (template) {
    case "countries.by-name": {
      const prompt: Prompt =
        format === "TYPE_ALL"
          ? { kind: "none" }
          : format === "MAP_CLICK"
            ? { kind: "text", text: (e as QuizEntity).name }
            : { kind: "highlight", target: id };
      return base(prompt, [id], [id]);
    }
    case "capitals.by-country": {
      const item = base(
        format === "TYPE_ALL" ? { kind: "none" } : { kind: "text", text: (e as QuizEntity).name },
        [id],
        [id],
      );
      return mc
        ? withOptions(
            item,
            distractors(world, e as QuizEntity, pool, c.difficulty, template, rng),
            id,
          )
        : item;
    }
    case "countries.by-capital": {
      const item = base(
        { kind: "text", text: (e as QuizEntity).capitals[0]?.name ?? "" },
        [id],
        [id],
      );
      return mc
        ? withOptions(
            item,
            distractors(world, e as QuizEntity, pool, c.difficulty, template, rng),
            id,
          )
        : item;
    }
    case "flags.by-country": {
      const item = base({ kind: "flag", target: id }, [id], [id]);
      return mc
        ? withOptions(
            item,
            distractors(world, e as QuizEntity, pool, c.difficulty, template, rng),
            id,
          )
        : item;
    }
    case "continents.by-name":
    case "regions.by-name": {
      const g = group as NonNullable<typeof group>;
      const prompt: Prompt =
        format === "MAP_CLICK" ? { kind: "text", text: g.name } : { kind: "highlight", target: id };
      const item = base(prompt, [id], [...g.members]);
      return mc ? withOptions(item, groupOptions(world, id, g.kind, rng), id) : item;
    }
    case "countries.by-continent": {
      const cont = `continent:${(e as QuizEntity).continent}`;
      const item = base({ kind: "text", text: (e as QuizEntity).name }, [cont], [id]);
      return withOptions(item, groupOptions(world, cont, "continent", rng), cont);
    }
  }
}

/**
 * `generateQuiz(world, config, seed, history)`: pure and deterministic (quiz-library §11.1). Selects the items (all of
 * them, or a weighted random subset), orders them, and picks multiple-choice distractors, all from one seeded stream.
 */
export function generateQuiz(
  world: QuizWorld,
  config: QuizConfig,
  seed: string,
  history: QuizHistory = [],
): Quiz {
  if (!ALLOWED_FORMATS[config.template].includes(config.format))
    throw new RangeError(`${config.template} does not support ${config.format}`);
  const rng = makeRng(seed, "quiz", config);
  const universe = universeOf(config.template);
  const skill = skillFor(config.template, config.format);

  let slots: { id: string; prior: number; name: string; area: number }[];
  let pool: QuizEntity[] = [];
  if (config.template === "continents.by-name" || config.template === "regions.by-name") {
    const kind = config.template === "continents.by-name" ? "continent" : "region";
    slots = world.groups
      .filter((g) => g.kind === kind)
      .map((g) => ({
        id: g.id,
        prior: 0.5,
        name: g.name,
        area: g.members.reduce((s, m) => s + (world.byId.get(m)?.areaKm2 ?? 0), 0),
      }));
  } else {
    pool = countryPool(world, config.countrySet, config.scope);
    slots = pool
      .filter((e) =>
        config.template !== "capitals.by-country" && config.template !== "countries.by-capital"
          ? true
          : e.capitals.length > 0,
      )
      .map((e) => ({ id: e.id, prior: e.difficulty[skill] ?? 0.5, name: e.name, area: e.areaKm2 }));
  }
  if (slots.length === 0) throw new RangeError("no items in this scope");

  let chosen = slots;
  if (config.count !== "all" && config.count < slots.length) {
    const recent = new Set(history.slice(-repeatWindow(slots.length, config.count)).flat());
    const weights = slots.map(
      (s) => difficultyWeight(s.prior, config.difficulty) * (recent.has(s.id) ? repeatWeight : 1),
    );
    chosen = sample(slots, weights, config.count, rng.fork("subset"));
  }
  const ordered =
    config.order === "alphabetical"
      ? [...chosen].sort((a, b) => a.name.localeCompare(b.name))
      : config.order === "largest"
        ? [...chosen].sort((a, b) => b.area - a.area || a.name.localeCompare(b.name))
        : rng.fork("order").shuffle(chosen);

  const itemRng = rng.fork("items");
  const items = ordered.map((s) => itemFor(world, config, s.id, itemRng.fork(s.id), pool));
  const limitMs = config.timed && !config.learn ? timeLimitMs(config.format, items.length) : null;
  return { config, seed, universe, items, limitMs };
}

export { CONTINENT_NAMES, inScope, inSet };
