import { topology } from "topojson-server";
import {
  ambiguityGroup,
  dispute,
  entity,
  manifest,
  topology as topologySchema,
  type AmbiguityGroup,
  type DailySchedule,
  type Dispute,
  type Entity,
  type Manifest,
  type SourceRegistry,
} from "@meridian/schemas";
import {
  buildAdjacency,
  difficultyPriors,
  findContacts,
  splitParts,
  type AdjacencyOverrides,
  type SilhouetteOverride,
} from "./derive.ts";
import type { Editorial } from "./editorial.ts";
import { buildFacts, type authoredFile, type PopulatedPlace } from "./facts.ts";
import type { z } from "zod";
import {
  dropSlivers,
  normalizeGeometry,
  polygonsOf,
  type Geometry,
  type PolygonCoords,
} from "./geometry.ts";
import { mergeCountries, type SetMember } from "./merge.ts";
import { indexByCode, type NeCollection, type NeCountry } from "./ne.ts";
import { parseCountries, type WdCountry, type WdSnapshot } from "./wikidata.ts";
import { sha256, stableStringify } from "./util.ts";

export type Scale = "110m" | "50m" | "10m";
/**
 * TopoJSON quantization per scale (grid cells across 360°). Coarser grids made thin shapes cross themselves and
 * collapsed microstates to zero area: at 1e4 a cell is about 4 km, wider than the Vatican. These values were
 * chosen by validating the real 197-country build; the next step up bought nothing for 20% more bytes.
 */
export const QUANTIZATION: Record<Scale, number> = { "110m": 1e5, "50m": 1e6, "10m": 1e7 };

export type BuildInput = {
  version: string;
  releasedAt: string;
  members: readonly SetMember[];
  ne: Record<Scale, NeCollection>;
  wikidata: WdSnapshot;
  registry: SourceRegistry;
  /** Reviewed names and capitals. Without it the pack stays a draft with names taken from the sources. */
  editorial?: Editorial;
  ambiguity?: readonly AmbiguityGroup[];
  disputes?: readonly Dispute[];
  /** Derived packs (T1.2): silhouettes, adjacency and difficulty priors. Needs `editorial`. */
  /** Curated fact files and populated places: adds the `facts.v1` pack (curated, capitals and cities). */
  factSources?: {
    authored: readonly { file: z.infer<typeof authoredFile> }[];
    places: readonly PopulatedPlace[];
  };
  /** ISO alpha-3 codes with no ocean coast (content/landlocked.yaml). */
  landlocked?: ReadonlySet<string>;
  /** Flag SVGs by ISO alpha-2 and the editorial confusables groups. Adds the `flags.svg` pack. */
  flags?: { svg: ReadonlyMap<string, string>; confusables: ReadonlyMap<string, readonly string[]> };
  /** Daily schedules (content/daily/*.json), shipped as `daily.<game>` packs. */
  daily?: readonly DailySchedule[];
  derive?: { silhouettes: readonly SilhouetteOverride[]; adjacency: AdjacencyOverrides };
};

export type BuiltFile = { name: string; file: string; bytes: Uint8Array; sha256: string };
export type BuildOutput = {
  version: string;
  files: BuiltFile[];
  manifest: Manifest;
  releaseNotes: string;
  /** Entities missing from NE 1:110m, drawn from 1:50m instead (the 110m file omits microstates). */
  fallback110: string[];
};

const LICENSE_CODE: Record<string, string> = {
  "Public domain": "PD",
  "CC0 1.0": "CC0",
  MIT: "MIT",
  "All rights reserved": "ARR",
  "CC BY 4.0": "CC-BY-4.0",
  "SIL OFL 1.1": "OFL-1.1",
  ISC: "ISC",
};
const licenseCode = (license: string): string =>
  LICENSE_CODE[license] ?? license.replace(/[^A-Za-z0-9.]+/g, "-");

function toFile(pack: string, value: unknown): BuiltFile {
  const bytes = new TextEncoder().encode(`${stableStringify(value)}\n`);
  const hash = sha256(bytes);
  return { name: pack, file: `${pack}.${hash.slice(0, 6)}.json`, bytes, sha256: hash };
}

/**
 * The whole pipeline from parsed inputs to packs and manifest. Pure: the same inputs give byte-identical output
 * (DETERMINISM). Reading files and writing `dist/` happen outside, in the CLI.
 */
export function buildPacks(input: BuildInput): BuildOutput {
  const maps: Record<Scale, Map<string, NeCountry>> = {
    "110m": indexByCode(input.ne["110m"]),
    "50m": indexByCode(input.ne["50m"]),
    "10m": indexByCode(input.ne["10m"]),
  };
  const wd = new Map<string, WdCountry>(input.wikidata.countries.map((c) => [c.code, c]));
  const merged: Entity[] = mergeCountries({
    members: input.members,
    ne10: maps["10m"],
    wikidata: wd,
    ...(input.editorial ? { editorial: input.editorial } : {}),
    capitals: input.wikidata.capitals,
    ...(input.flags ? { flags: input.flags } : {}),
    ...(input.landlocked ? { landlocked: input.landlocked } : {}),
  });

  const unknown = [...(input.landlocked ?? [])].filter(
    (c) => !input.members.some((m) => m.code === c),
  );
  if (unknown.length > 0)
    throw new Error(`content/landlocked.yaml lists codes outside the set: ${unknown.join(", ")}`);
  const priors = input.derive ? difficultyPriors(merged) : undefined;
  const entities: Entity[] = priors
    ? merged.map((e) => ({
        ...e,
        difficulty: priors.get(e.id) as NonNullable<Entity["difficulty"]>,
      }))
    : merged;

  const files: BuiltFile[] = [
    toFile("core.countries", {
      pack: "core.countries",
      draft: !input.editorial,
      version: input.version,
      entities,
    }),
  ];
  if (input.flags) {
    const svg: Record<string, string> = {};
    for (const e of entities)
      if (e.flag)
        svg[e.id] = input.flags.svg.get((e.external_ids.iso2 as string).toUpperCase()) as string;
    files.push(toFile("flags.svg", { pack: "flags.svg", version: input.version, flags: svg }));
  }
  if (input.factSources) {
    const facts = buildFacts({
      authored: input.factSources.authored,
      entities,
      places: input.factSources.places,
      reviewedAt: input.releasedAt.slice(0, 10),
    });
    files.push(toFile("facts.v1", { pack: "facts.v1", version: input.version, facts }));
  }
  if (input.derive) files.push(...deriveFiles(input, entities, maps));
  for (const d of input.daily ?? [])
    files.push(
      toFile(`daily.${d.game}`, { pack: `daily.${d.game}`, version: input.version, ...d }),
    );
  if (input.ambiguity)
    files.push(
      toFile("core.ambiguity", {
        pack: "core.ambiguity",
        version: input.version,
        groups: [...input.ambiguity]
          .map((g) => ambiguityGroup.parse(g))
          .sort((a, b) => a.group.localeCompare(b.group)),
      }),
    );
  if (input.disputes)
    files.push(
      toFile("core.disputes", {
        pack: "core.disputes",
        version: input.version,
        disputes: [...input.disputes]
          .map((d) => dispute.parse(d))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }),
    );
  const fallback110: string[] = [];

  for (const scale of ["110m", "50m", "10m"] as const) {
    const features = entities.map((e) => {
      const code = e.id.slice("country:".length);
      let ne = maps[scale].get(code);
      if (!ne && scale === "110m") {
        ne = maps["50m"].get(code);
        if (ne) fallback110.push(code);
      }
      if (!ne) throw new Error(`${e.id}: no geometry at ${scale} (GEOM_MISSING)`);
      // Anything smaller than one grid cell would collapse to zero area, so it is dropped. An empty result is an error.
      const cell = 360 / QUANTIZATION[scale];
      const geometry: Geometry | null = dropSlivers(normalizeGeometry(ne.geometry), cell * cell);
      if (!geometry)
        throw new Error(`${e.id}: nothing is larger than one grid cell at ${scale} (GEOM_MISSING)`);
      return { type: "Feature" as const, id: e.id, properties: {}, geometry };
    });
    const topo = topology(
      { countries: { type: "FeatureCollection", features } as never },
      QUANTIZATION[scale],
    );
    files.push(toFile(`geo.world.${scale}`, topologySchema.parse(topo)));
  }

  const used = input.registry.sources.filter((s) =>
    s.used_in.some((u) => files.some((f) => f.name === u)),
  );
  const licenses = [...new Set(used.map((s) => `${s.id}:${licenseCode(s.license)}`))].sort();
  const packs = Object.fromEntries(
    files.map((f) => [
      f.name,
      { url: `content/${input.version}/${f.file}`, bytes: f.bytes.length, sha256: f.sha256 },
    ]),
  );
  const result = manifest.parse({
    current: input.version,
    versions: {
      [input.version]: {
        released_at: input.releasedAt,
        packs,
        licenses,
        notes_url: `content/${input.version}/RELEASE_NOTES.md`,
      },
    },
  });

  const notes = [
    `# Content release ${input.version}`,
    "",
    input.editorial
      ? "Status: names, aliases and capitals reviewed (content/countries.yaml)."
      : "Status: DRAFT. Names and aliases are unreviewed.",
    "",
    "## Packs",
    ...files.map((f) => `- ${f.file} (${f.bytes.length} bytes, sha256 ${f.sha256})`),
    "",
    "## Sources",
    ...used.map(
      (s) => `- ${s.name}: ${s.license}${s.attribution_text ? `. ${s.attribution_text}` : ""}`,
    ),
    "",
    ...(fallback110.length > 0
      ? [
          `1:110m omits ${fallback110.length} small states; they use their 1:50m outlines there: ${fallback110.sort().join(", ")}.`,
          "",
        ]
      : []),
  ].join("\n");

  return {
    version: input.version,
    files,
    manifest: result,
    releaseNotes: notes,
    fallback110: fallback110.sort(),
  };
}

/** `geo.silhouettes` (main group and remote parts per entity) and `core.adjacency` (land borders). */
function deriveFiles(
  input: BuildInput,
  entities: readonly Entity[],
  maps: Record<Scale, Map<string, NeCountry>>,
): BuiltFile[] {
  const derive = input.derive as NonNullable<BuildInput["derive"]>;
  const overrides = new Map(derive.silhouettes.map((o) => [o.entity, o]));
  const cell = 360 / QUANTIZATION["50m"];
  const main: unknown[] = [];
  const remote: unknown[] = [];
  const contactGeoms = new Map<string, PolygonCoords[]>();
  const mainCount = new Map<string, number>();
  const asGeometry = (polys: PolygonCoords[]): Geometry =>
    polys.length === 1
      ? { type: "Polygon", coordinates: polys[0] as PolygonCoords }
      : { type: "MultiPolygon", coordinates: polys };
  for (const e of entities) {
    const code = e.id.slice("country:".length);
    const g50 = dropSlivers(
      normalizeGeometry((maps["50m"].get(code) as NeCountry).geometry),
      cell * cell,
    );
    if (!g50) throw new Error(`${e.id}: no silhouette geometry (GEOM_MISSING)`);
    const parts = splitParts(polygonsOf(g50), overrides.get(e.id));
    main.push({
      type: "Feature",
      id: e.id,
      properties: { parts: "main" },
      geometry: asGeometry(parts.main),
    });
    if (parts.remote.length > 0)
      remote.push({
        type: "Feature",
        id: e.id,
        properties: { parts: "remote", remote_parts: parts.remoteParts },
        geometry: asGeometry(parts.remote),
      });
    const g10 = normalizeGeometry((maps["10m"].get(code) as NeCountry).geometry);
    const split10 = splitParts(polygonsOf(g10), overrides.get(e.id));
    contactGeoms.set(e.id, [...split10.main, ...split10.remote]);
    mainCount.set(e.id, split10.main.length);
  }
  const topo = topology(
    {
      main: { type: "FeatureCollection", features: main } as never,
      remote: { type: "FeatureCollection", features: remote } as never,
    },
    QUANTIZATION["50m"],
  );
  const edges = buildAdjacency(
    findContacts(contactGeoms),
    mainCount,
    derive.adjacency,
    input.disputes ?? [],
  );
  return [
    toFile("geo.silhouettes", topologySchema.parse(topo)),
    toFile("core.adjacency", { pack: "core.adjacency", version: input.version, edges }),
  ];
}

export { entity, parseCountries };
