import { CONTINENT_NAMES, type QuizEntity, type QuizItem, type QuizWorld } from "@meridian/quiz";
import { Rng } from "@meridian/game-kit";
import type { QuizFacts } from "./data";
import { t } from "../i18n";

export type AccessibleItem = { description: string; options: string[]; correctIndex: number };

const list = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * "Choose without the map" (AC-QZ-020, quiz-library §9): a MAP_CLICK item rendered as a description and four options.
 * The description never names the answer: it says whether the country has a coast, its continent and its land
 * neighbours. Options are the answer plus three others, same continent first.
 */
export function accessibleItem(
  world: QuizWorld,
  facts: QuizFacts,
  neighbors: ReadonlyMap<string, ReadonlySet<string>>,
  item: QuizItem,
  seed: string,
): AccessibleItem {
  const rng = new Rng(`${seed}|accessible|${item.id}`);
  const group = world.groupById.get(item.id);
  if (group) {
    const members = rng
      .shuffle(group.members)
      .slice(0, 3)
      .map((id) => world.byId.get(id)?.name ?? id);
    const others = rng
      .shuffle(world.groups.filter((g) => g.kind === group.kind && g.id !== group.id))
      .slice(0, 3);
    const options = rng.shuffle([group.id, ...others.map((g) => g.id)]);
    return {
      description: t("qz.accGroup", { n: group.members.length, list: list(members) }),
      options,
      correctIndex: options.indexOf(group.id),
    };
  }
  const e = world.byId.get(item.id) as QuizEntity;
  const land = facts.landlocked.has(e.id);
  const borders = [...(neighbors.get(e.id) ?? [])]
    .map((id) => world.byId.get(id)?.name ?? id)
    .sort((a, b) => a.localeCompare(b));
  const continent = CONTINENT_NAMES[e.continent] ?? e.continent;
  const description = [
    t(land ? "qz.accLandlocked" : "qz.accCoastal", { continent }),
    borders.length > 0 ? t("qz.accBorders", { list: list(borders) }) : t("qz.accNoBorders"),
  ].join(" ");
  const pool = world.entities.filter((o) => o.id !== e.id && o.type === "country");
  const near = rng.shuffle(pool.filter((o) => o.continent === e.continent));
  const far = rng.shuffle(pool.filter((o) => o.continent !== e.continent));
  const picks = [...near, ...far].slice(0, 3).map((o) => o.id);
  const options = rng.shuffle([e.id, ...picks]);
  return { description, options, correctIndex: options.indexOf(e.id) };
}
