import { topology } from "topojson-server";
import {
  entity,
  manifest,
  topology as topologySchema,
  type Entity,
  type Manifest,
  type SourceRegistry,
} from "@meridian/schemas";
import { dropSlivers, normalizeGeometry, type Geometry } from "./geometry.ts";
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
  const entities: Entity[] = mergeCountries({
    members: input.members,
    ne10: maps["10m"],
    wikidata: wd,
  });

  const files: BuiltFile[] = [
    toFile("core.countries", {
      pack: "core.countries",
      draft: true,
      version: input.version,
      entities,
    }),
  ];
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
    "Status: DRAFT. Names and aliases are unreviewed (T1.1 applies the style guide).",
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

export { entity, parseCountries };
