import {
  buildWorld,
  type RankEntity,
  type RankWorld,
  type StatDef,
  type StatValues,
} from "@meridian/rank-it";

type PackEntity = {
  id: string;
  names: { canonical: string };
  parent_ids: string[];
  sets?: string[];
  difficulty?: { fam: number };
};

export type RankItPacks = {
  countries: { entities: PackEntity[] };
  indicators: { stats: StatDef[]; values: StatValues };
};

export type LoadedRankIt = { world: RankWorld };

export function assembleRankIt(p: RankItPacks): LoadedRankIt {
  const entities: RankEntity[] = p.countries.entities
    .filter((e) => e.sets?.includes("sovereign-197"))
    .map((e) => ({
      id: e.id,
      name: e.names.canonical,
      continent:
        e.parent_ids.find((x) => x.startsWith("continent:"))?.slice("continent:".length) ?? "",
      familiarity: e.difficulty?.fam ?? 0.5,
    }));
  return { world: buildWorld(entities, p.indicators.stats, p.indicators.values) };
}

export async function loadRankItPacks(
  loader: { pack<T>(name: string, version?: string): Promise<T> },
  version?: string,
): Promise<RankItPacks> {
  const [countries, indicators] = await Promise.all([
    loader.pack<RankItPacks["countries"]>("core.countries", version),
    loader.pack<RankItPacks["indicators"]>("core.indicators", version),
  ]);
  return { countries, indicators };
}
