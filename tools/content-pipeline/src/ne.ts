import type { Geometry } from "./geometry.ts";

/** One Natural Earth admin-0 feature (GeoJSON). Only the properties we read are typed. */
export type NeFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: Geometry | null;
};
export type NeCollection = { type: "FeatureCollection"; features: NeFeature[] };

/**
 * Natural Earth marks many valid codes as "-99" (France, Norway, Kosovo) and uses its own for a few.
 * These two are the only corrections needed: Kosovo has no ISO code (Meridian assigns XKX) and
 * NE's Palestine uses ADM0_A3 "PSX".
 */
export const NE_CODE_FIXES: Record<string, string> = { KOS: "XKX", PSX: "PSE" };

const str = (v: unknown): string | null =>
  typeof v === "string" && v !== "" && v !== "-99" ? v : null;

/** Meridian's ISO-style alpha-3 for a Natural Earth feature, or null when it has none. */
export function neCode(props: Record<string, unknown>): string | null {
  const code = str(props["ISO_A3_EH"]) ?? str(props["ADM0_A3"]);
  return code ? (NE_CODE_FIXES[code] ?? code) : null;
}

export type NeCountry = {
  code: string;
  name: string;
  /** NE's NAME_LONG, usually the unabbreviated form ("Democratic Republic of the Congo"). */
  nameLong: string | null;
  formalName: string | null;
  iso2: string | null;
  continent: string | null;
  subregion: string | null;
  labelPoint: [number, number] | null;
  /** NE's POP_EST and POP_YEAR (the year of the estimate). */
  population: { value: number; year: number } | null;
  geometry: Geometry;
};

const adm0 = (props: Record<string, unknown>): string | null => {
  const a = str(props["ADM0_A3"]);
  return a ? (NE_CODE_FIXES[a] ?? a) : null;
};

/**
 * Index features by code. Natural Earth gives dependencies and leases the sovereign's code (Clipperton and France,
 * Baikonur and Kazakhstan, the Indian Ocean Territories and Australia). The main feature is the one whose own
 * ADM0_A3 equals the code. If that does not pick exactly one, the build fails: it cannot silently choose.
 */
export function indexByCode(collection: NeCollection): Map<string, NeCountry> {
  const groups = new Map<string, NeFeature[]>();
  for (const f of collection.features) {
    const code = neCode(f.properties);
    if (!code || !f.geometry) continue;
    groups.set(code, [...(groups.get(code) ?? []), f]);
  }
  const out = new Map<string, NeCountry>();
  for (const [code, list] of groups) {
    const main = list.length === 1 ? list : list.filter((f) => adm0(f.properties) === code);
    if (main.length !== 1) {
      throw new Error(
        `Natural Earth has ${list.length} features for ${code} (${list.map((f) => str(f.properties["NAME"])).join(", ")}) and ${main.length} of them are the main one`,
      );
    }
    const f = main[0] as NeFeature;
    const name = str(f.properties["NAME"]) ?? str(f.properties["NAME_EN"]) ?? code;
    const x = f.properties["LABEL_X"];
    const y = f.properties["LABEL_Y"];
    out.set(code, {
      code,
      name,
      nameLong: str(f.properties["NAME_LONG"]),
      formalName: str(f.properties["FORMAL_EN"]),
      iso2: str(f.properties["ISO_A2_EH"]),
      continent: str(f.properties["CONTINENT"]),
      subregion: str(f.properties["SUBREGION"]),
      labelPoint: typeof x === "number" && typeof y === "number" ? [y, x] : null,
      population:
        typeof f.properties["POP_EST"] === "number" &&
        f.properties["POP_EST"] > 0 &&
        typeof f.properties["POP_YEAR"] === "number"
          ? { value: f.properties["POP_EST"], year: f.properties["POP_YEAR"] }
          : null,
      geometry: f.geometry as Geometry,
    });
  }
  return out;
}

/** Natural Earth continent names → Meridian `continent:` codes. "Seven seas (open ocean)" has no continent. */
export const CONTINENT_CODES: Record<string, string> = {
  Africa: "AF",
  Antarctica: "AN",
  Asia: "AS",
  Europe: "EU",
  "North America": "NA",
  Oceania: "OC",
  "South America": "SA",
};

export const regionSlug = (subregion: string): string =>
  subregion
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
