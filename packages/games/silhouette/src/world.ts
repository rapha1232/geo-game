import { NameIndex, norm, type AmbiguityGroup } from "@meridian/name-matcher";
import type { SilEntity } from "./types";

export type AdjacencyEdge = { a: string; b: string };

type Key = { key: string; id: string; canonical: boolean };

/** Everything the engine reads, built once per content release. */
export type World = {
  entities: readonly SilEntity[];
  byId: ReadonlyMap<string, SilEntity>;
  neighbors: ReadonlyMap<string, ReadonlySet<string>>;
  index: NameIndex;
  /** Alias keys sorted for suggestions. */
  keys: readonly Key[];
};

export function buildWorld(
  entities: readonly SilEntity[],
  edges: readonly AdjacencyEdge[],
  groups: readonly AmbiguityGroup[] = [],
): World {
  const neighbors = new Map<string, Set<string>>();
  const link = (x: string, y: string): void => {
    (neighbors.get(x) ?? neighbors.set(x, new Set()).get(x)!).add(y);
  };
  for (const e of edges) {
    link(e.a, e.b);
    link(e.b, e.a);
  }
  const keys: Key[] = [];
  for (const e of entities) {
    const seen = new Set<string>();
    for (const [text, canonical] of [
      [e.name, true],
      ...e.aliases
        .filter((a) => a.kind !== "code" && a.kind !== "translation")
        .map((a) => [a.text, false] as const),
    ] as (readonly [string, boolean])[]) {
      const key = norm(text);
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      keys.push({ key, id: e.id, canonical });
    }
  }
  return {
    entities,
    byId: new Map(entities.map((e) => [e.id, e])),
    neighbors,
    index: new NameIndex(entities, groups),
    keys,
  };
}

/**
 * Autocomplete (silhouette §5.1): after one character, up to 6 entities with an alias key that starts with the
 * input, canonical-name matches first, then alphabetical. Never filtered to the target pool (that would leak it).
 */
export function suggest(world: World, input: string, limit = 6): SilEntity[] {
  const q = norm(input);
  if (q === "") return [];
  const best = new Map<string, boolean>();
  for (const k of world.keys)
    if (k.key.startsWith(q)) best.set(k.id, (best.get(k.id) ?? false) || k.canonical);
  return [...best.entries()]
    .map(([id, canonical]) => ({ e: world.byId.get(id) as SilEntity, canonical }))
    .sort((a, b) => Number(b.canonical) - Number(a.canonical) || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((x) => x.e);
}
