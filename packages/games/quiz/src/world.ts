import { NameIndex, norm, type AmbiguityGroup, type MatchEntity } from "@meridian/name-matcher";
import type { CountrySet, Prompt, QuizEntity, QuizGroup, Scope, Template, Universe } from "./types";

export const CONTINENT_NAMES: Record<string, string> = {
  AF: "Africa",
  AS: "Asia",
  EU: "Europe",
  NA: "North America",
  OC: "Oceania",
  SA: "South America",
};

/** Everything the engine reads: entities, the continent and subregion groups, and one name index per answer universe. */
export type QuizWorld = {
  entities: readonly QuizEntity[];
  byId: ReadonlyMap<string, QuizEntity>;
  groups: readonly QuizGroup[];
  groupById: ReadonlyMap<string, QuizGroup>;
  indexes: Record<Universe, NameIndex>;
};

export function buildQuizWorld(
  entities: readonly QuizEntity[],
  ambiguity: readonly AmbiguityGroup[] = [],
): QuizWorld {
  const continents = new Map<string, string[]>();
  const regions = new Map<string, { name: string; members: string[] }>();
  for (const e of entities) {
    if (e.type !== "country") continue;
    (continents.get(e.continent) ?? continents.set(e.continent, []).get(e.continent)!).push(e.id);
    if (e.region) {
      const r = regions.get(e.region.id) ?? { name: e.region.name, members: [] };
      r.members.push(e.id);
      regions.set(e.region.id, r);
    }
  }
  const groups: QuizGroup[] = [
    ...[...continents.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, members]) => ({
        id: `continent:${id}`,
        kind: "continent" as const,
        name: CONTINENT_NAMES[id] ?? id,
        members,
      })),
    ...[...regions.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, r]) => ({
        id: `region:${id}`,
        kind: "region" as const,
        name: r.name,
        members: r.members,
      })),
  ];
  const capitalEntities: MatchEntity[] = entities
    .filter((e) => e.capitals.length > 0)
    .map((e) => ({
      id: e.id,
      name: e.capitals[0]!.name,
      aliases: e.capitals.slice(1).map((c) => ({ text: c.name, kind: "common" as const })),
    }));
  const groupEntities: MatchEntity[] = groups.map((g) => ({ id: g.id, name: g.name, aliases: [] }));
  return {
    entities,
    byId: new Map(entities.map((e) => [e.id, e])),
    groups,
    groupById: new Map(groups.map((g) => [g.id, g])),
    indexes: {
      country: new NameIndex(entities, ambiguity),
      capital: new NameIndex(capitalEntities),
      group: new NameIndex(groupEntities),
    },
  };
}

/** Which answer universe a template is typed against. */
export const universeOf = (template: Template): Universe =>
  template === "capitals.by-country"
    ? "capital"
    : template === "continents.by-name" ||
        template === "regions.by-name" ||
        template === "countries.by-continent"
      ? "group"
      : "country";

/** Countries (and territories, when the set includes them) in a set. */
export function inSet(e: QuizEntity, set: CountrySet): boolean {
  switch (set) {
    case "sovereign-197":
      return e.sets.includes("sovereign-197");
    case "un-193":
      return e.sets.includes("un-193");
    case "sovereign+territories":
      return e.sets.includes("sovereign-197") || e.type === "territory";
  }
}

export function inScope(e: QuizEntity, scope: Scope): boolean {
  switch (scope.kind) {
    case "world":
      return true;
    case "continent":
      return e.continent === scope.id;
    case "region":
      return e.region?.id === scope.id;
  }
}

/** The pool of countries a quiz draws from. */
export const countryPool = (world: QuizWorld, set: CountrySet, scope: Scope): QuizEntity[] =>
  world.entities.filter((e) => inSet(e, set) && inScope(e, scope));

export const scopeLabel = (world: QuizWorld, scope: Scope): string =>
  scope.kind === "world"
    ? "the world"
    : scope.kind === "continent"
      ? (CONTINENT_NAMES[scope.id] ?? scope.id)
      : (world.groupById.get(`region:${scope.id}`)?.name ?? scope.id);

/** Display text of an option or item in its universe: capitals show the capital, countries and groups their name. */
export function optionLabel(world: QuizWorld, template: Template, id: string): string {
  if (template === "capitals.by-country") return world.byId.get(id)?.capitals[0]?.name ?? id;
  return world.byId.get(id)?.name ?? world.groupById.get(id)?.name ?? id;
}

export function describePrompt(world: QuizWorld, p: Prompt): string {
  switch (p.kind) {
    case "text":
      return p.text;
    case "highlight":
    case "flag":
      return world.byId.get(p.target)?.name ?? world.groupById.get(p.target)?.name ?? p.target;
    case "none":
      return "";
  }
}

export { norm };
