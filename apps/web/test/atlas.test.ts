import { describe, expect, it } from "vitest";
import type { Topology } from "topojson-specification";
import { breaks, classOf, legendLabels } from "../lib/atlas/classify";
import { matching, parseFilter, serializeFilter } from "../lib/atlas/filter";
import { addCompare, parseState, removeCompare, stateToSearch } from "../lib/atlas/state";
import { assembleAtlas, flagEmoji, layerView, type AtlasPacks } from "../lib/atlas/data";

const topology = {
  type: "Topology",
  objects: { countries: { type: "GeometryCollection", geometries: [] } },
  arcs: [],
} as unknown as Topology;
const ent = (iso: string, name: string, extra: Record<string, unknown> = {}) => ({
  id: `country:${iso}`,
  names: { canonical: name },
  parent_ids: ["continent:SA"],
  sets: ["sovereign-197"],
  label_point: [0, 0] as [number, number],
  capitals: [{ name: `${name} City`, role: "official" }],
  external_ids: { iso2: iso.slice(0, 2) },
  ...extra,
});
const stat = {
  id: "population",
  label: "population",
  unit: "people",
  sort: "desc" as const,
  separation: { relative: 0.1 },
  decimals: 0,
  source_id: "wd",
  source_note: "Country population from the content release",
};
const packs: AtlasPacks = {
  countries: {
    entities: [
      ent("PER", "Peru"),
      ent("CHL", "Chile"),
      ent("BOL", "Bolivia", { landlocked: true }),
      ent("ECU", "Ecuador"),
      ent("ARG", "Argentina"),
    ],
  },
  indicators: {
    stats: [stat],
    values: {
      population: {
        "country:PER": [34_000_000, 2024],
        "country:CHL": [19_000_000, 2024],
        "country:BOL": [12_000_000, 2024],
        "country:ECU": [18_000_000, 2024],
      },
    },
  },
  adjacency: {
    edges: [
      { a: "country:CHL", b: "country:PER" },
      { a: "country:BOL", b: "country:PER" },
    ],
  },
  facts: {
    facts: [
      {
        id: "fact:1",
        text: "A fact",
        answer_label: "Lima",
        reveal: "r",
        entities: ["country:PER"],
        status: "published",
        sources: [],
      },
      {
        id: "fact:2",
        text: "Draft",
        answer_label: "x",
        reveal: "r",
        entities: ["country:PER"],
        status: "draft",
        sources: [],
      },
    ],
  },
  topology,
};
const world = assembleAtlas(packs);

describe("classification", () => {
  it("quantile breaks put about the same number in each class", () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    const b = breaks(v, "quantile");
    expect(b).toHaveLength(4);
    const counts = [0, 0, 0, 0, 0];
    for (const x of v) counts[classOf(x, b)]!++;
    expect(counts.every((c) => c >= 19 && c <= 21)).toBe(true);
  });
  it("log breaks are evenly spaced on a log scale and every class has a label", () => {
    const b = breaks([1_000, 10_000_000, 1_400_000_000], "log");
    expect(b[1]! / b[0]!).toBeCloseTo(b[2]! / b[1]!, 5);
    const labels = legendLabels(b);
    expect(labels).toHaveLength(5);
    expect(labels[0]).toMatch(/^< /);
    expect(labels[4]).toMatch(/^≥ /);
  });
});

describe("filter (AC-AE-002)", () => {
  it("parses, serialises and keeps at most three clauses", () => {
    const f = parseFilter("population>100000000,landlocked=true,life-expectancy<60,area>1");
    expect(f).toHaveLength(3);
    expect(serializeFilter(f)).toBe("population>100000000,landlocked=true,life-expectancy<60");
    expect(parseFilter("nonsense>3,population>x")).toEqual([]);
  });
  it("matches places and counts them, treating missing data as not matching", () => {
    const ids = world.places.map((p) => p.id);
    expect(matching(parseFilter("population>15000000"), ids, world.lookup)).toEqual([
      "country:PER",
      "country:CHL",
      "country:ECU",
    ]);
    expect(
      matching(parseFilter("population>15000000,landlocked=false"), ids, world.lookup),
    ).toHaveLength(3);
    expect(matching(parseFilter("population>1"), ids, world.lookup)).not.toContain("country:ARG");
    expect(matching([], ids, world.lookup)).toHaveLength(5);
  });
});

describe("state and compare", () => {
  it("AC-AE-013 round-trips layer, filter and selection through the URL", () => {
    const s = parseState(
      "?layer=density&filter=population>1000000&sel=country:PER&compare=country:CHL,country:BOL&view=table",
    );
    expect(s).toMatchObject({
      layer: "density",
      sel: "country:PER",
      view: "table",
      compare: ["country:CHL", "country:BOL"],
    });
    expect(parseState(stateToSearch(s))).toEqual(s);
  });
  it("AC-AE-007 a deep link selects the entity from the path", () => {
    expect(parseState("", "country:PER").sel).toBe("country:PER");
    expect(parseState("", "nonsense").sel).toBeNull();
  });
  it("ignores unknown layers", () => {
    expect(parseState("?layer=nope").layer).toBe("political");
  });
  it("AC-AE-004 holds three and a fourth replaces the oldest", () => {
    let list: string[] = [];
    for (const id of ["a", "b", "c"]) list = addCompare(list, id).list;
    const r = addCompare(list, "d");
    expect(r.list).toEqual(["b", "c", "d"]);
    expect(r.replaced).toBe("a");
    expect(addCompare(r.list, "c").list).toEqual(["b", "c", "d"]);
    expect(removeCompare(r.list, "c")).toEqual(["b", "d"]);
  });
});

describe("world and layers", () => {
  it("AC-AE-011 marks places without data and builds a legend for an indicator layer", () => {
    const v = layerView(world, "population");
    expect(v.noData.has("country:ARG")).toBe(true);
    expect(v.states["country:ARG"]).toBe("nodata");
    expect(Object.keys(v.classes)).toHaveLength(4);
    expect(v.legend).toHaveLength(5);
  });
  it("shows landlocked places with a pattern and says what it means", () => {
    const v = layerView(world, "landlocked");
    expect(v.states["country:BOL"]).toBe("near");
    expect(v.states["country:PER"]).toBeUndefined();
    expect(v.keyItems.map((k) => k.label)).toEqual(["Landlocked", "Has a coast"]);
  });
  it("carries neighbours, published facts and a flag", () => {
    expect(world.neighbors.get("country:PER")).toEqual(["country:BOL", "country:CHL"]);
    expect(world.facts.get("country:PER")?.map((f) => f.id)).toEqual(["fact:1"]);
    expect(flagEmoji("PE")).toBe("🇵🇪");
    expect(flagEmoji(undefined)).toBe("");
  });
  it("AC-AE-001 every value carries its year and source", () => {
    expect(world.value("population", "country:PER")).toEqual([34_000_000, 2024]);
    expect(world.stats.get("population")?.source_note).toContain("content release");
  });
});
