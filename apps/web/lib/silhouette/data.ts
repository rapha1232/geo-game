import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { buildWorld, type SilEntity, type World } from "@meridian/silhouette";

type PackEntity = {
  id: string;
  type: "country" | "territory";
  names: {
    canonical: string;
    aliases: { text: string; kind: string; lang?: string; script?: string }[];
  };
  ref_point?: [number, number];
  label_point: [number, number];
  parent_ids: string[];
  sets?: string[];
  capitals?: { name: string }[];
  area_km2?: { value: number };
  difficulty?: { shape: number };
};

export type SilhouettePacks = {
  countries: { entities: PackEntity[] };
  adjacency: { edges: { a: string; b: string }[] };
  ambiguity: { groups: { group: string; alias: string; members: string[]; message: string }[] };
  silhouettes: Topology;
};

export type Shape = {
  /** GeoJSON geometry of the main group. */
  main: GeoJSON.Geometry;
  remote: GeoJSON.Geometry | null;
};

export type Loaded = { world: World; shapes: ReadonlyMap<string, Shape> };

type Feat = {
  id: string;
  properties: { remote_parts?: { ref_point: [number, number]; area_km2: number }[] };
  geometry: GeoJSON.Geometry;
};

const features = (topo: Topology, name: string): Feat[] => {
  const obj = topo.objects[name];
  if (!obj) return [];
  return (feature(topo, obj) as unknown as { features: Feat[] }).features;
};

/** Turns the content packs into the engine's world and the drawable shapes. Pure, so it is testable without a browser. */
export function assemble(packs: SilhouettePacks): Loaded {
  const main = new Map(features(packs.silhouettes, "main").map((f) => [f.id, f]));
  const remote = new Map(features(packs.silhouettes, "remote").map((f) => [f.id, f]));
  const entities: SilEntity[] = packs.countries.entities.map((e) => {
    const continent =
      e.parent_ids.find((p) => p.startsWith("continent:"))?.slice("continent:".length) ?? "";
    return {
      id: e.id,
      name: e.names.canonical,
      aliases: e.names.aliases.map((a) => ({ text: a.text, kind: a.kind as never })),
      type: e.type,
      continent,
      areaKm2: e.area_km2?.value ?? 0,
      ref: e.ref_point ?? e.label_point,
      shape: e.difficulty?.shape ?? 0.5,
      sets: e.sets ?? [],
      capitals: (e.capitals ?? []).map((c) => c.name),
      remote: (remote.get(e.id)?.properties.remote_parts ?? []).map((p) => ({
        ref: p.ref_point,
        areaKm2: p.area_km2,
      })),
    };
  });
  const shapes = new Map<string, Shape>();
  for (const e of entities) {
    const m = main.get(e.id);
    if (m) shapes.set(e.id, { main: m.geometry, remote: remote.get(e.id)?.geometry ?? null });
  }
  return { world: buildWorld(entities, packs.adjacency.edges, packs.ambiguity.groups), shapes };
}

/** Loads the four packs the game needs. */
export async function loadSilhouettePacks(loader: {
  pack<T>(name: string): Promise<T>;
}): Promise<SilhouettePacks> {
  const [countries, adjacency, ambiguity, silhouettes] = await Promise.all([
    loader.pack<SilhouettePacks["countries"]>("core.countries"),
    loader.pack<SilhouettePacks["adjacency"]>("core.adjacency"),
    loader.pack<SilhouettePacks["ambiguity"]>("core.ambiguity"),
    loader.pack<SilhouettePacks["silhouettes"]>("geo.silhouettes"),
  ]);
  return { countries, adjacency, ambiguity, silhouettes };
}
