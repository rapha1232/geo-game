import { norm } from "@meridian/name-matcher";
import { dropSlivers, normalizeGeometry, type Geometry } from "./geometry.ts";

/** Countries with a subdivision pack (quiz-library §4.2, R2) and the number of subdivisions each must have. */
export const SUBDIVISION_COUNTRIES: readonly {
  code: string;
  name: string;
  /** What the places are called in the interface ("state", "province"…). */
  kind: string;
  expected: number;
  /** NE features that are not part of the main division (remote islands and enclaves), by NE `name`. */
  exclude?: readonly string[];
}[] = [
  { code: "ARG", name: "Argentina", kind: "province", expected: 24 },
  {
    code: "AUS",
    name: "Australia",
    kind: "state or territory",
    expected: 8,
    exclude: ["Jervis Bay Territory", "Macquarie Island", "Lord Howe Island"],
  },
  { code: "BRA", name: "Brazil", kind: "state", expected: 27 },
  { code: "CAN", name: "Canada", kind: "province or territory", expected: 13 },
  { code: "CHL", name: "Chile", kind: "region", expected: 16 },
  { code: "DEU", name: "Germany", kind: "state", expected: 16 },
  { code: "IDN", name: "Indonesia", kind: "province", expected: 33 },
  { code: "JPN", name: "Japan", kind: "prefecture", expected: 47 },
  { code: "KOR", name: "South Korea", kind: "province", expected: 17 },
  { code: "NGA", name: "Nigeria", kind: "state", expected: 37 },
  { code: "USA", name: "United States", kind: "state", expected: 51 },
  { code: "ZAF", name: "South Africa", kind: "province", expected: 9 },
];

type Props = {
  name: string | null;
  name_en: string | null;
  name_local: string | null;
  iso_3166_2: string | null;
  postal: string | null;
  adm0_a3: string;
  latitude: number | null;
  longitude: number | null;
};
export type Admin1 = {
  features: { properties: Props; geometry: Geometry }[];
};

export type Subdivision = {
  id: string;
  name: string;
  aliases: { text: string; kind: "common" | "code" }[];
  /** ISO 3166-2 code, e.g. `US-CA`. */
  code: string;
  label_point: [number, number];
};
export type SubdivisionPack = {
  pack: "core.subdivisions";
  version: string;
  countries: Record<string, { name: string; kind: string; subdivisions: Subdivision[] }>;
};

const QUANT = 1e5;

/**
 * Subdivision names and outlines from Natural Earth admin-1 (public domain), for the countries above. Aliases are kept to
 * what is safe: the postal abbreviation, the English name when it differs, and the local name; NE's `name_alt` mixes in
 * capitals and other regions, so it is not used. Deterministic.
 */
export function buildSubdivisions(
  admin1: Admin1,
  version: string,
): {
  index: SubdivisionPack;
  outlines: Map<string, { type: "FeatureCollection"; features: unknown[] }>;
} {
  const countries: SubdivisionPack["countries"] = {};
  const outlines = new Map<string, { type: "FeatureCollection"; features: unknown[] }>();
  for (const c of SUBDIVISION_COUNTRIES) {
    const skip = new Set(c.exclude ?? []);
    const rows = admin1.features
      .filter(
        (f) => f.properties.adm0_a3 === c.code && f.properties.name && !skip.has(f.properties.name),
      )
      .sort((a, b) => (a.properties.iso_3166_2 ?? "").localeCompare(b.properties.iso_3166_2 ?? ""));
    if (rows.length !== c.expected)
      throw new Error(
        `${c.code}: expected ${c.expected} subdivisions, found ${rows.length} (SUB_BOUNDS)`,
      );
    const names = new Set(rows.map((r) => norm(r.properties.name as string)));
    const taken = new Set<string>();
    const subs: Subdivision[] = [];
    const features: unknown[] = [];
    for (const r of rows) {
      const p = r.properties;
      const code = p.iso_3166_2;
      if (!code) throw new Error(`${c.code}: ${p.name} has no ISO 3166-2 code`);
      const id = `subdivision:${code}`;
      if (subs.some((s) => s.id === id)) throw new Error(`${c.code}: ${id} appears twice`);
      const own = norm(p.name as string);
      const aliases: Subdivision["aliases"] = [];
      for (const [text, kind] of [
        [p.name_en, "common"],
        [p.name_local, "common"],
        [p.postal, "code"],
      ] as const) {
        const k = text ? norm(text) : "";
        // A label that is another subdivision's name, or already taken here, would make a second answer ambiguous.
        if (!text || !k || k === own || names.has(k) || taken.has(k)) continue;
        taken.add(k);
        aliases.push({ text, kind });
      }
      subs.push({
        id,
        name: p.name as string,
        aliases,
        code,
        label_point: [p.latitude ?? 0, p.longitude ?? 0],
      });
      const cell = 360 / QUANT;
      const geometry = dropSlivers(normalizeGeometry(r.geometry), cell * cell);
      if (!geometry) throw new Error(`${id}: nothing is larger than one grid cell`);
      features.push({ type: "Feature", id, properties: {}, geometry });
    }
    countries[c.code] = { name: c.name, kind: c.kind, subdivisions: subs };
    outlines.set(c.code, { type: "FeatureCollection", features });
  }
  return { index: { pack: "core.subdivisions", version, countries }, outlines };
}

export const SUBDIVISION_QUANTIZATION = QUANT;
