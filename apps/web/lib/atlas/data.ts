import type { Topology } from "topojson-specification";
import type { StatDef, StatValues } from "@meridian/rank-it";
import type { Lookup } from "./filter";
import { breaks, classOf, legendLabels } from "./classify";
import { layerById, type LayerId } from "./layers";

type PackEntity = {
  id: string;
  names: { canonical: string };
  parent_ids: string[];
  sets?: string[];
  landlocked?: boolean;
  external_ids?: Record<string, string>;
  capitals?: { name: string; role: string; point?: [number, number] }[];
  label_point: [number, number];
};
type PackFact = {
  id: string;
  text: string;
  answer_label: string;
  reveal: string;
  entities: string[];
  status: string;
  sources: { title: string; url: string }[];
};

export type AtlasPacks = {
  countries: { entities: PackEntity[] };
  indicators: { stats: StatDef[]; values: StatValues };
  adjacency: { edges: { a: string; b: string }[] };
  facts: { facts: PackFact[] };
  topology: Topology;
};

export type Place = {
  id: string;
  name: string;
  continent: string;
  capital: string | null;
  /** The pack lists landlocked countries only (content/landlocked.yaml); every other country has a coast. */
  landlocked: boolean;
  flag: string;
  labelPoint: readonly [number, number];
};
export type AtlasFact = { id: string; text: string; reveal: string };

export type AtlasWorld = {
  places: readonly Place[];
  byId: ReadonlyMap<string, Place>;
  stats: ReadonlyMap<string, StatDef>;
  neighbors: ReadonlyMap<string, readonly string[]>;
  facts: ReadonlyMap<string, readonly AtlasFact[]>;
  lookup: Lookup;
  topology: Topology;
  /** `[value, year]` of an indicator for a place. */
  value(layer: string, id: string): readonly [number, number | null] | undefined;
};

/** A flag emoji from the two-letter code (regional indicator symbols), or an empty string. */
export const flagEmoji = (iso2: string | undefined): string =>
  iso2 && /^[A-Za-z]{2}$/.test(iso2)
    ? String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : "";

export function assembleAtlas(p: AtlasPacks): AtlasWorld {
  const places: Place[] = p.countries.entities
    .filter((e) => e.sets?.includes("sovereign-197"))
    .map((e) => ({
      id: e.id,
      name: e.names.canonical,
      continent:
        e.parent_ids.find((x) => x.startsWith("continent:"))?.slice("continent:".length) ?? "",
      capital: e.capitals?.[0]?.name ?? null,
      landlocked: e.landlocked === true,
      flag: flagEmoji(e.external_ids?.["iso2"]),
      labelPoint: e.label_point,
    }));
  const ids = new Set(places.map((x) => x.id));
  const nb = new Map<string, string[]>();
  for (const { a, b } of p.adjacency.edges)
    if (ids.has(a) && ids.has(b)) {
      (nb.get(a) ?? nb.set(a, []).get(a)!).push(b);
      (nb.get(b) ?? nb.set(b, []).get(b)!).push(a);
    }
  const facts = new Map<string, AtlasFact[]>();
  for (const f of p.facts.facts)
    if (f.status === "published")
      for (const id of f.entities)
        if (ids.has(id))
          (facts.get(id) ?? facts.set(id, []).get(id)!).push({
            id: f.id,
            text: f.text,
            reveal: f.reveal,
          });
  const byId = new Map(places.map((x) => [x.id, x]));
  const value = (layer: string, id: string) => p.indicators.values[layer]?.[id];
  return {
    places,
    byId,
    stats: new Map(p.indicators.stats.map((s) => [s.id, s])),
    neighbors: new Map([...nb].map(([k, v]) => [k, v.sort()])),
    facts,
    topology: p.topology,
    value,
    lookup: {
      indicator: (layer, id) => value(layer, id)?.[0],
      landlocked: (id) => byId.get(id)?.landlocked,
    },
  };
}

export async function loadAtlasPacks(loader: {
  pack<T>(name: string, version?: string): Promise<T>;
}): Promise<AtlasPacks> {
  const [countries, indicators, adjacency, facts, topology] = await Promise.all([
    loader.pack<AtlasPacks["countries"]>("core.countries"),
    loader.pack<AtlasPacks["indicators"]>("core.indicators"),
    loader.pack<AtlasPacks["adjacency"]>("core.adjacency"),
    loader.pack<AtlasPacks["facts"]>("facts.v1"),
    loader.pack<Topology>("geo.world.110m"),
  ]);
  return { countries, indicators, adjacency, facts, topology };
}

/** What the map and legend need for the chosen layer. */
export type LayerView = {
  /** Choropleth class (0 to 4) per place; absent where there is no data. */
  classes: Record<string, number>;
  legend: { label: string; cls: number }[];
  /** Places without data on an indicator layer. */
  noData: Set<string>;
  /** Pattern state per place for categorical layers (landlocked is dotted, so it never relies on colour alone). */
  states: Record<string, "near" | "nodata">;
  /** Legend for categorical layers. */
  keyItems: { label: string; mark: string }[];
};

export function layerView(world: AtlasWorld, layer: LayerId): LayerView {
  const def = layerById(layer);
  const classes: Record<string, number> = {};
  const noData = new Set<string>();
  if (!def || def.kind === "category") {
    const states: LayerView["states"] = {};
    if (layer === "landlocked")
      for (const x of world.places) {
        if (x.landlocked) states[x.id] = "near";
      }
    return {
      classes,
      legend: [],
      noData,
      states,
      keyItems:
        layer === "landlocked"
          ? [
              { mark: "◐", label: "Landlocked" },
              { mark: "□", label: "Has a coast" },
            ]
          : [],
    };
  }
  const vals = world.places.flatMap((x) => {
    const v = world.value(layer, x.id)?.[0];
    return v === undefined ? [] : [v];
  });
  const bounds = breaks(vals, def.scheme);
  for (const x of world.places) {
    const v = world.value(layer, x.id)?.[0];
    if (v === undefined) noData.add(x.id);
    else classes[x.id] = classOf(v, bounds);
  }
  return {
    classes,
    legend: legendLabels(bounds).map((label, cls) => ({ label, cls })),
    noData,
    states: Object.fromEntries([...noData].map((id) => [id, "nodata" as const])),
    keyItems: [],
  };
}
