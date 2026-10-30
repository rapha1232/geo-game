import {
  buildQuizWorld,
  type QuizConfig,
  type QuizEntity,
  type QuizWorld,
  type Skill,
} from "@meridian/quiz";

type PackEntity = {
  id: string;
  type: "country" | "territory";
  names: { canonical: string; aliases: { text: string; kind: string; lang?: string }[] };
  parent_ids: string[];
  subregion?: string;
  area_km2?: { value: number };
  capitals?: { name: string; role: string }[];
  difficulty?: Partial<Record<Skill, number>>;
  sets?: string[];
  flag?: { svg: string; confusables: string[] };
  landlocked?: boolean;
  label_point: [number, number];
};

export type QuizPacks = {
  countries: { entities: PackEntity[] };
  ambiguity: { groups: { group: string; alias: string; members: string[]; message: string }[] };
};

/** What the accessible "choose without the map" variant needs beyond the engine's entity. */
export type QuizFacts = {
  landlocked: ReadonlySet<string>;
  labelPoints: ReadonlyMap<string, readonly [number, number]>;
};

export type LoadedQuiz = { world: QuizWorld; facts: QuizFacts };

export function assembleQuiz(
  packs: QuizPacks,
  edges: readonly { a: string; b: string }[] = [],
): LoadedQuiz & { neighbors: ReadonlyMap<string, ReadonlySet<string>> } {
  const entities: QuizEntity[] = packs.countries.entities.map((e) => {
    const regionParent = e.parent_ids.find((p) => p.startsWith("region:"));
    return {
      id: e.id,
      name: e.names.canonical,
      aliases: e.names.aliases.map((a) => ({
        text: a.text,
        kind: a.kind as never,
        ...(a.lang ? { lang: a.lang } : {}),
      })),
      type: e.type,
      continent:
        e.parent_ids.find((p) => p.startsWith("continent:"))?.slice("continent:".length) ?? "",
      region:
        regionParent && e.subregion
          ? { id: regionParent.slice("region:".length), name: e.subregion }
          : null,
      areaKm2: e.area_km2?.value ?? 0,
      capitals: e.capitals ?? [],
      difficulty: e.difficulty ?? {},
      sets: e.sets ?? [],
      ...(e.flag?.confusables.length ? { confusables: e.flag.confusables } : {}),
    };
  });
  const neighbors = new Map<string, Set<string>>();
  for (const { a, b } of edges) {
    (neighbors.get(a) ?? neighbors.set(a, new Set()).get(a)!).add(b);
    (neighbors.get(b) ?? neighbors.set(b, new Set()).get(b)!).add(a);
  }
  return {
    world: buildQuizWorld(entities, packs.ambiguity.groups),
    facts: {
      landlocked: new Set(packs.countries.entities.filter((e) => e.landlocked).map((e) => e.id)),
      labelPoints: new Map(packs.countries.entities.map((e) => [e.id, e.label_point] as const)),
    },
    neighbors,
  };
}

export async function loadQuizPacks(loader: {
  pack<T>(name: string, version?: string): Promise<T>;
}) {
  const [countries, ambiguity, adjacency] = await Promise.all([
    loader.pack<QuizPacks["countries"]>("core.countries"),
    loader.pack<QuizPacks["ambiguity"]>("core.ambiguity"),
    loader.pack<{ edges: { a: string; b: string }[] }>("core.adjacency"),
  ]);
  return { packs: { countries, ambiguity } as QuizPacks, edges: adjacency.edges };
}

export type { QuizConfig };
