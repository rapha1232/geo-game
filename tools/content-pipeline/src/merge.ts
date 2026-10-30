import { entity, type Entity } from "@meridian/schemas";
import { boundingBox, polygonsOf, refPoint, type Geometry } from "./geometry.ts";
import { areaKm2, editorialAliases, resolveCapitals, type Editorial } from "./editorial.ts";
import { CONTINENT_CODES, regionSlug, type NeCountry } from "./ne.ts";
import type { WdCapital, WdCountry } from "./wikidata.ts";

export type SetMember = { code: string; un: boolean };

export type MergeInput = {
  members: readonly SetMember[];
  /** Natural Earth 1:10m, the source of truth for names, ref points, bounding boxes and label points. */
  ne10: ReadonlyMap<string, NeCountry>;
  wikidata: ReadonlyMap<string, WdCountry>;
  /** Hand-edited names and capitals. Without it the entities keep their unreviewed draft names. */
  editorial?: Editorial;
  capitals?: readonly WdCapital[];
  /** ISO alpha-3 codes with no ocean coast. */
  landlocked?: ReadonlySet<string>;
  /** Flag SVGs by ISO alpha-2 and editorial confusables by alpha-3. */
  flags?: { svg: ReadonlyMap<string, string>; confusables: ReadonlyMap<string, readonly string[]> };
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

/** ISO alpha-3 and alpha-2, accepted only in lenient TYPE_ALL (DATA_AND_CONTENT §5.1). */
function codeAliases(canonical: string, ne: NeCountry, code: string): Alias[] {
  const out: Alias[] = [];
  const seen = new Set([canonical.toLowerCase()]);
  for (const t of [code, ne.iso2])
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push({ text: t, kind: "code" });
    }
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
    const edit = input.editorial?.get(m.code);
    if (input.editorial && !edit) throw new Error(`${m.code}: no entry in content/countries.yaml`);
    const canonical = edit?.name ?? ne.nameLong ?? ne.name;
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
      names: {
        canonical,
        aliases: edit
          ? [...editorialAliases(edit), ...codeAliases(canonical, ne, m.code)]
          : collectAliases(canonical, ne, wd, m.code),
      },
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
      ...(edit ? { capitals: resolveCapitals(m.code, edit, input.capitals ?? []) } : {}),
      ...(input.landlocked?.has(m.code) ? { landlocked: true } : {}),
      ...(input.flags && ne.iso2 && input.flags.svg.has(ne.iso2.toUpperCase())
        ? {
            flag: {
              svg: `country:${m.code}`,
              aspect: 1.333333,
              confusables: (input.flags.confusables.get(m.code) ?? []).map((c) => `country:${c}`),
            },
          }
        : {}),
      ...(ne.population ? { population: { ...ne.population, source: "ne" } } : {}),
      area_km2: { value: Math.round(areaKm2(polygonsOf(geometry)) * 100) / 100, source: "ne" },
    };
    out.push(entity.parse(candidate));
  }
  return out;
}
