import type { Topology } from "topojson-specification";
import { subIndex, type SubItem } from "@meridian/quiz";
import type { NameIndex } from "@meridian/name-matcher";

type PackSub = {
  id: string;
  name: string;
  aliases: { text: string; kind: string }[];
  code: string;
  label_point: [number, number];
};
export type SubdivisionIndexPack = {
  countries: Record<string, { name: string; kind: string; subdivisions: PackSub[] }>;
};

export type LoadedSubdivisions = {
  items: SubItem[];
  names: ReadonlyMap<string, string>;
  index: NameIndex;
  entities: { id: string; name: string; labelPoint: readonly [number, number] }[];
  topology: Topology;
};

/** One country's subdivisions: names for typing, outlines for the map. */
export async function loadSubdivisions(
  loader: { pack<T>(name: string, version?: string): Promise<T> },
  code: string,
): Promise<LoadedSubdivisions> {
  const [pack, topology] = await Promise.all([
    loader.pack<SubdivisionIndexPack>("core.subdivisions"),
    loader.pack<Topology>(`geo.sub.${code.toLowerCase()}`),
  ]);
  const country = pack.countries[code.toUpperCase()];
  if (!country) throw new Error(`no subdivisions for ${code}`);
  const items: SubItem[] = country.subdivisions.map((s) => ({
    id: s.id,
    name: s.name,
    aliases: s.aliases.map((a) => ({ text: a.text, kind: a.kind as never })),
  }));
  return {
    items,
    names: new Map(items.map((i) => [i.id, i.name])),
    index: subIndex(items),
    entities: country.subdivisions.map((s) => ({
      id: s.id,
      name: s.name,
      labelPoint: s.label_point,
    })),
    topology,
  };
}
