import { z } from "zod";
import { latLon, type Alias, type Entity } from "@meridian/schemas";
import { round6 } from "./util.ts";
import type { WdCapital } from "./wikidata.ts";

const text = z.string().trim().min(1);

const capitalEntry = z.union([
  text,
  z
    .object({
      name: text,
      role: z.enum(["official", "constitutional", "seat_of_government"]).default("official"),
      note: text.optional(),
      /** The Wikidata label when it differs from the display name ("Yaren District" for Yaren). */
      wd_label: text.optional(),
      valid_from: text.optional(),
      /** [lat, lon]. Only for a capital whose Wikidata item has no English label or coordinates. */
      point: latLon.optional(),
      /** Where an explicit point comes from, so a reviewer can check it. */
      point_source: text.optional(),
    })
    .strict(),
]);

/** One country's hand-edited naming and capitals (`content/countries.yaml`, DATA_AND_CONTENT §5 and §7.1). */
export const countryEdit = z
  .object({
    /** The canonical display name, following the style guide in DATA_AND_CONTENT §5.3. */
    name: text,
    official: z.array(text).default([]),
    common: z.array(text).default([]),
    former: z.array(text).default([]),
    endonym: z.array(text).default([]),
    misspelling: z.array(text).default([]),
    capitals: z.array(capitalEntry).min(1),
  })
  .strict();
export type CountryEdit = z.infer<typeof countryEdit>;

export const editorialFile = z
  .object({ sources: z.array(text).optional(), countries: z.record(z.string(), countryEdit) })
  .strict();
export type Editorial = ReadonlyMap<string, CountryEdit>;

export function parseEditorial(doc: unknown): Editorial {
  const parsed = editorialFile.parse(doc);
  return new Map(Object.entries(parsed.countries));
}

/** Every member needs an entry and every entry a member: a missing one would silently fall back to draft names. */
export function checkEditorialCoverage(editorial: Editorial, codes: readonly string[]): void {
  const want = new Set(codes);
  const missing = codes.filter((c) => !editorial.has(c));
  const extra = [...editorial.keys()].filter((c) => !want.has(c));
  if (missing.length > 0 || extra.length > 0)
    throw new Error(
      `content/countries.yaml does not match the set: missing ${missing.join(", ") || "none"}; unknown ${extra.join(", ") || "none"}`,
    );
}

const ALIAS_ORDER = ["common", "official", "former", "endonym", "misspelling"] as const;

/** The editorial aliases in a fixed order, without repeating the canonical name or each other. */
export function editorialAliases(edit: CountryEdit): Alias[] {
  const seen = new Set([edit.name.toLowerCase()]);
  const out: Alias[] = [];
  for (const kind of ALIAS_ORDER)
    for (const t of edit[kind]) {
      if (seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      out.push({ text: t, kind });
    }
  return out;
}

/**
 * Resolves each listed capital to a point. The point comes from the Wikidata snapshot (matched by label) or, for the few
 * items Wikidata cannot supply, from an explicit editorial `point` with its source. Never guessed.
 */
export function resolveCapitals(
  code: string,
  edit: CountryEdit,
  wikidata: readonly WdCapital[],
): NonNullable<Entity["capitals"]> {
  return edit.capitals.map((entry) => {
    const c = typeof entry === "string" ? { name: entry, role: "official" as const } : entry;
    const explicit = typeof entry === "string" ? undefined : entry.point;
    if (explicit && !(typeof entry !== "string" && entry.point_source))
      throw new Error(`${code}: capital ${c.name} has a point but no point_source`);
    const found = wikidata.find(
      (w) =>
        w.code === code &&
        w.label === (typeof entry === "string" ? entry : (entry.wd_label ?? entry.name)),
    );
    const point = explicit ?? found?.coord ?? null;
    if (!point)
      throw new Error(
        `${code}: capital ${c.name} has no coordinates (not in the Wikidata snapshot, and no editorial point)`,
      );
    return {
      name: c.name,
      role: c.role,
      point: [round6(point[0]), round6(point[1])] as [number, number],
      ...(typeof entry !== "string" && entry.note ? { note: entry.note } : {}),
      ...(typeof entry !== "string" && entry.valid_from ? { valid_from: entry.valid_from } : {}),
    };
  });
}

/** Spherical polygon area in km² (Chamberlain and Duquette's formula on a sphere of Earth's mean radius). Approximate by design. */
export function areaKm2(
  polygons: ReadonlyArray<ReadonlyArray<ReadonlyArray<[number, number]>>>,
): number {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  const ringArea = (ring: ReadonlyArray<[number, number]>): number => {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i] as [number, number];
      const [x2, y2] = ring[i + 1] as [number, number];
      let dx = x2 - x1;
      if (dx > 180) dx -= 360;
      else if (dx < -180) dx += 360;
      sum += dx * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
    }
    return Math.abs((sum * R * R) / 2);
  };
  let total = 0;
  for (const poly of polygons)
    poly.forEach((ring, i) => {
      total += (i === 0 ? 1 : -1) * ringArea(ring);
    });
  return total;
}
