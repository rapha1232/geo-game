import type { Topology } from "topojson-specification";
import { buildGraph, type BrWorld, type Graph } from "@meridian/border-run";
import { buildWorld, type SilEntity, type World } from "@meridian/silhouette";

type PackEntity = {
  id: string;
  type: "country" | "territory";
  names: {
    canonical: string;
    aliases: { text: string; kind: string; lang?: string; script?: string }[];
  };
  label_point: [number, number];
  parent_ids: string[];
  sets?: string[];
};

export type BorderRunPacks = {
  countries: { entities: PackEntity[] };
  adjacency: { edges: { a: string; b: string }[] };
  crossings: { crossings: { a: string; b: string; type: string; name: string }[] };
  ambiguity: { groups: { group: string; alias: string; members: string[]; message: string }[] };
  topology: Topology;
};

export type CrossingInfo = { a: string; b: string; type: string; name: string };

export type LoadedBorderRun = {
  world: World;
  /** The playing graph for a crossings setting. */
  bw: (crossings: boolean) => BrWorld;
  crossings: readonly CrossingInfo[];
  continentOf: (id: string) => string | undefined;
  mapEntities: readonly { id: string; name: string; labelPoint: readonly [number, number] }[];
  topology: Topology;
};

/** Turns the packs into the engine's world. Pure, so it is testable without a browser. */
export function assembleBorderRun(p: BorderRunPacks): LoadedBorderRun {
  const members = p.countries.entities.filter((e) => e.sets?.includes("sovereign-197"));
  const entities: SilEntity[] = members.map((e) => ({
    id: e.id,
    name: e.names.canonical,
    aliases: e.names.aliases.map((a) => ({ text: a.text, kind: a.kind as never })),
    type: e.type,
    continent:
      e.parent_ids.find((x) => x.startsWith("continent:"))?.slice("continent:".length) ?? "",
    areaKm2: 0,
    ref: e.label_point,
    shape: 0.5,
    sets: e.sets ?? [],
    capitals: [],
    remote: [],
  }));
  const world = buildWorld(entities, [], p.ambiguity.groups);
  const ids = entities.map((e) => e.id);
  const graphs = new Map<boolean, Graph>();
  const bw = (crossings: boolean): BrWorld => {
    const graph =
      graphs.get(crossings) ??
      buildGraph(ids, p.adjacency.edges, crossings ? p.crossings.crossings : []);
    graphs.set(crossings, graph);
    return { world, graph };
  };
  return {
    world,
    bw,
    crossings: p.crossings.crossings,
    continentOf: (id) => world.byId.get(id)?.continent,
    mapEntities: members.map((e) => ({
      id: e.id,
      name: e.names.canonical,
      labelPoint: e.label_point,
    })),
    topology: p.topology,
  };
}

export async function loadBorderRunPacks(
  loader: { pack<T>(name: string, version?: string): Promise<T> },
  version?: string,
): Promise<BorderRunPacks> {
  const [countries, adjacency, crossings, ambiguity, topology] = await Promise.all([
    loader.pack<BorderRunPacks["countries"]>("core.countries", version),
    loader.pack<BorderRunPacks["adjacency"]>("core.adjacency", version),
    loader.pack<BorderRunPacks["crossings"]>("core.crossings", version),
    loader.pack<BorderRunPacks["ambiguity"]>("core.ambiguity", version),
    loader.pack<Topology>("geo.world.110m", version),
  ]);
  return { countries, adjacency, crossings, ambiguity, topology };
}
