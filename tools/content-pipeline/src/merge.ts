import { entity, type Entity } from "@meridian/schemas";
import { boundingBox, refPoint, type Geometry } from "./geometry.ts";
import { CONTINENT_CODES, regionSlug, type NeCountry } from "./ne.ts";
import type { WdCountry } from "./wikidata.ts";

export type SetMember = { code: string; un: boolean };

export type MergeInput = {
  members: readonly SetMember[];
  /** Natural Earth 1:10m, the source of truth for names, ref points, bounding boxes and label points. */
  ne10: ReadonlyMap<string, NeCountry>;
  wikidata: ReadonlyMap<string, WdCountry>;
};

type Alias = { text: string; kind: "common" | "official" | "code" };

/** Distinct aliases (case-insensitive), never repeating the canonical name. */
function collectAliases(
  canonical: string,
  ne: NeCountry,
  wd: WdCountry | undefined,
  code: string,
): Alias[] {
  const out: Alias[] = [];
  const seen = new Set([canonical.toLowerCase()]);
  const add = (text: string | null | undefined, kind: Alias["kind"]) => {
    const t = text?.trim();
    if (!t || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push({ text: t, kind });
  };
  add(ne.name, "common");
  add(wd?.label, "common");
  for (const a of wd?.altLabels ?? []) add(a, "common");
  add(ne.formalName, "official");
  for (const o of wd?.officialNames ?? []) add(o, "official");
  add(code, "code");
  add(ne.iso2, "code");
  return out;
}

/**
 * Builds `core.countries` entities for the editorial set. Names are draft: T1.1 applies the style guide,
 * reviews aliases and adds capitals with roles. Everything here is derived, never invented.
 */
export function mergeCountries(input: MergeInput): Entity[] {
  const out: Entity[] = [];
  for (const m of [...input.members].sort((a, b) => a.code.localeCompare(b.code))) {
    const ne = input.ne10.get(m.code);
    if (!ne) throw new Error(`${m.code}: no Natural Earth 1:10m geometry (GEOM_MISSING)`);
    const wd = input.wikidata.get(m.code);
    const canonical = ne.nameLong ?? ne.name;
    const geometry: Geometry = ne.geometry;
    const ref = refPoint(geometry);
    const continent = ne.continent ? CONTINENT_CODES[ne.continent] : undefined;
    const parents = [
      ...(ne.subregion ? [`region:${regionSlug(ne.subregion)}`] : []),
      ...(continent ? [`continent:${continent}`] : []),
    ];
    const candidate = {
      id: `country:${m.code}`,
      type: "country" as const,
      names: { canonical, aliases: collectAliases(canonical, ne, wd, m.code) },
      external_ids: {
        iso3: m.code,
        ...(ne.iso2 ? { iso2: ne.iso2 } : {}),
        ...(wd ? { wikidata: wd.qid } : {}),
      },
      label_point: ne.labelPoint ?? ref,
      ref_point: ref,
      bbox: boundingBox(geometry),
      parent_ids: parents,
      sets: m.un
        ? (["sovereign-197", "un-193"] as ("sovereign-197" | "un-193")[])
        : (["sovereign-197"] as ("sovereign-197" | "un-193")[]),
      source_ids: ["ne", "wd", "mer"],
      ...(ne.continent ? { continent: ne.continent } : {}),
      ...(ne.subregion ? { subregion: ne.subregion } : {}),
    };
    out.push(entity.parse(candidate));
  }
  return out;
}
