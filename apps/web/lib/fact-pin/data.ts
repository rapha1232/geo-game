import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { normTokens } from "@meridian/name-matcher";
import type { MultiPolygon } from "@meridian/geo";
import type { Fact } from "@meridian/schemas";
import type { AreaResolver, PinFact } from "@meridian/fact-pin";

type PackEntity = {
  id: string;
  names: { canonical: string };
  label_point: [number, number];
};

export type FactPinPacks = {
  facts: { facts: Fact[] };
  countries: { entities: PackEntity[] };
  topology: Topology;
};

/** A place the player can pin by typing its name (fact-pin §7.3): countries and every city or capital in the bank. */
export type Place = { id: string; name: string; key: string; lat: number; lon: number };

export type LoadedFactPin = {
  facts: PinFact[];
  byId: ReadonlyMap<string, PinFact>;
  areas: AreaResolver;
  places: readonly Place[];
  countryName: (id: string) => string;
  mapEntities: readonly { id: string; name: string; labelPoint: readonly [number, number] }[];
  topology: Topology;
};

export function toPinFact(f: Fact): PinFact {
  return {
    id: f.id,
    text: f.text,
    answerLabel: f.answer_label,
    category: f.category,
    era: f.era,
    precision: f.precision,
    target: f.target as PinFact["target"],
    toleranceKm: f.tolerance_km,
    reveal: f.reveal,
    sources: f.sources,
    difficulty: f.difficulty,
    entities: f.entities,
    continent: f.continent ?? "",
    status: f.status,
    countries: f.entities.filter((e) => e.startsWith("country:")),
  };
}

/** Geometry by entity id, decoded once from the 1:50m pack. */
export function areaResolver(topology: Topology): AreaResolver {
  const object = topology.objects["countries"] as GeometryCollection | undefined;
  const cache = new Map<string, MultiPolygon>();
  if (object) {
    const fc = feature(topology, object) as unknown as {
      features: {
        id?: string | number;
        geometry: { type: string; coordinates: unknown } | null;
      }[];
    };
    for (const f of fc.features) {
      if (f.id === undefined || !f.geometry) continue;
      if (f.geometry.type === "Polygon")
        cache.set(String(f.id), [f.geometry.coordinates as MultiPolygon[number]]);
      else if (f.geometry.type === "MultiPolygon")
        cache.set(String(f.id), f.geometry.coordinates as MultiPolygon);
    }
  }
  return (id) => cache.get(id);
}

export function assembleFactPin(p: FactPinPacks): LoadedFactPin {
  const facts = p.facts.facts.map(toPinFact);
  const names = new Map(p.countries.entities.map((e) => [e.id, e.names.canonical] as const));
  const places: Place[] = [];
  const seen = new Set<string>();
  const add = (id: string, name: string, lat: number, lon: number) => {
    const key = normTokens(name).join(" ");
    if (!key || seen.has(`${key}|${id}`)) return;
    seen.add(`${key}|${id}`);
    places.push({ id, name, key, lat, lon });
  };
  for (const e of p.countries.entities) add(e.id, e.names.canonical, ...e.label_point);
  for (const f of p.facts.facts)
    if (f.generated && f.target.type === "point")
      add(f.id, f.answer_label, f.target.coords[0], f.target.coords[1]);
  return {
    facts,
    byId: new Map(facts.map((f) => [f.id, f] as const)),
    areas: areaResolver(p.topology),
    places,
    countryName: (id) => names.get(id) ?? id,
    mapEntities: p.countries.entities.map((e) => ({
      id: e.id,
      name: e.names.canonical,
      labelPoint: e.label_point,
    })),
    topology: p.topology,
  };
}

/** Up to `limit` places whose name starts with the text, then those that contain it as a word prefix (AC-FP-012). */
export function searchPlaces(places: readonly Place[], text: string, limit = 8): Place[] {
  const q = normTokens(text).join(" ");
  if (q.length < 2) return [];
  const starts: Place[] = [];
  const words: Place[] = [];
  for (const p of places) {
    if (p.key.startsWith(q)) starts.push(p);
    else if (p.key.split(" ").some((w) => w.startsWith(q))) words.push(p);
  }
  return [...starts, ...words].slice(0, limit);
}

export async function loadFactPinPacks(loader: {
  pack<T>(name: string, version?: string): Promise<T>;
}): Promise<FactPinPacks> {
  const [facts, countries, topology] = await Promise.all([
    loader.pack<FactPinPacks["facts"]>("facts.v1"),
    loader.pack<FactPinPacks["countries"]>("core.countries"),
    loader.pack<Topology>("geo.world.50m"),
  ]);
  return { facts, countries, topology };
}
