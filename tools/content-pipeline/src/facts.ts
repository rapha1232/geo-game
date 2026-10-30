import { z } from "zod";
import { NE_CODE_FIXES } from "./ne.ts";
import { fact, type Entity, type Fact } from "@meridian/schemas";

const CONTINENTS = ["AF", "AS", "EU", "NA", "OC", "SA"] as const;
const text = z.string().trim().min(1);

/** One curated fact as editors write it (`content/facts/*.yaml`, see its README). Short keys keep files readable in bulk. */
export const authoredFact = z
  .object({
    id: z.string().regex(/^fact:\d{4,}$/),
    c: text, // category
    e: text, // era
    p: z.enum(["exact", "city", "region", "country", "broad"]), // precision
    at: z.tuple([z.number(), z.number()]).optional(), // [lat, lon] for a point target
    ent: z.string().optional(), // entity id for an area target
    tol: z.number().nonnegative().optional(), // tolerance in km for a point target
    d: z.number().min(0).max(1), // difficulty
    a: text, // answer label
    in: z.array(z.string()).default([]), // entities: countries the answer lies in
    k: z.enum(CONTINENTS).optional(), // continent, when the countries do not say it
    t: text, // the fact text
    r: text, // the reveal
    s: z.union([text, z.array(text).min(1)]), // "Title|URL" (one or more)
    sl: text.optional(), // source licence, default CC BY-SA 4.0
    review_due: z.string().optional(),
    sensitive: z.boolean().optional(),
  })
  .strict();
export type AuthoredFact = z.infer<typeof authoredFact>;

export const authoredFile = z
  .object({
    reviewed_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    facts: z.array(authoredFact),
  })
  .passthrough();

const slug = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The continent code of a country entity (`continent:EU` in its parents). */
const continentOf = (e: Entity): Fact["continent"] | undefined => {
  const c = e.parent_ids.find((p) => p.startsWith("continent:"))?.slice("continent:".length);
  return (CONTINENTS as readonly string[]).includes(c ?? "") ? (c as Fact["continent"]) : undefined;
};

/** Turns an authored fact into the pack record. Throws on anything the schema or the rules would reject. */
export function toFact(
  a: AuthoredFact,
  reviewedAt: string,
  entities: ReadonlyMap<string, Entity>,
): Fact {
  const countries = a.in.map((id) => entities.get(id)).filter((e): e is Entity => !!e);
  const continent = a.k ?? countries.map(continentOf).find((c) => !!c);
  if (!continent) throw new Error(`${a.id}: no continent (list a country in "in" or set "k")`);
  const unknown = a.in.filter((id) => id.startsWith("country:") && !entities.has(id));
  if (unknown.length > 0) throw new Error(`${a.id}: unknown entities ${unknown.join(", ")}`);
  const sources = (Array.isArray(a.s) ? a.s : [a.s]).map((s) => {
    const [title, url] = s.split("|");
    return {
      title: (title ?? "").trim(),
      url: (url ?? "").trim(),
      license: a.sl ?? "CC BY-SA 4.0 (cited, not copied)",
    };
  });
  const target = a.ent
    ? ({ type: "entity", id: a.ent } as const)
    : a.at
      ? ({ type: "point", coords: a.at } as const)
      : undefined;
  if (!target) throw new Error(`${a.id}: needs "at" or "ent"`);
  return fact.parse({
    id: a.id,
    text: a.t,
    answer_label: a.a,
    category: a.c,
    era: a.e,
    precision: a.p,
    target,
    ...(target.type === "point" ? { tolerance_km: a.tol ?? 10 } : {}),
    reveal: a.r,
    sources,
    difficulty: a.d,
    entities: [...a.in, `place:${slug(a.a)}`],
    status: "published",
    reviewed_at: reviewedAt,
    review_due: a.review_due ?? null,
    continent,
    ...(a.sensitive ? { sensitive: true } : {}),
  });
}

export type PopulatedPlace = {
  name: string;
  country: string;
  pop: number;
  capital: boolean;
  lat: number;
  lon: number;
};

/** Natural Earth populated places, reduced to what the generator needs. */
export function readPopulatedPlaces(geojson: {
  features: { properties: Record<string, unknown> }[];
}): PopulatedPlace[] {
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return geojson.features.flatMap((f) => {
    const p = f.properties;
    const name = typeof p["name"] === "string" ? p["name"] : null;
    const lat = num(p["latitude"]);
    const lon = num(p["longitude"]);
    const raw = typeof p["adm0_a3"] === "string" ? p["adm0_a3"] : null;
    const country = raw ? (NE_CODE_FIXES[raw] ?? raw) : null;
    if (!name || !country) return [];
    const feat = typeof p["featurecla"] === "string" ? p["featurecla"] : "";
    return [{ name, country, pop: num(p["pop_max"]), capital: /capital/i.test(feat), lat, lon }];
  });
}

const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** "Pin the capital of Mongolia." for every capital that has a point (fact-pin §4.2). */
export function capitalFacts(entities: readonly Entity[], reviewedAt: string): Fact[] {
  return [...entities]
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((e, i) => {
      const cap = e.capitals?.find((c) => c.point);
      if (!cap?.point) return [];
      return [
        fact.parse({
          id: `fact:${String(8001 + i).padStart(4, "0")}`,
          text: `Pin the capital of ${e.names.canonical}.`,
          answer_label: cap.name,
          category: "capitals-and-cities",
          era: "contemporary",
          precision: "city",
          target: { type: "point", coords: [r6(cap.point[0]), r6(cap.point[1])] },
          tolerance_km: 15,
          reveal: `${cap.name} is the capital of ${e.names.canonical}.${cap.note ? ` ${cap.note}` : ""}`,
          sources: [{ title: "Wikidata", url: "https://www.wikidata.org/", license: "CC0 1.0" }],
          difficulty: Math.round((e.difficulty?.capital ?? 0.5) * 100) / 100,
          entities: [e.id],
          status: "published",
          reviewed_at: reviewedAt,
          review_due: null,
          continent: continentOf(e),
          generated: true,
        }),
      ];
    });
}

/** "Pin the city of Lagos, in Nigeria." for the largest cities that are not capitals, by population (fact-pin §4.2). */
export function cityFacts(
  places: readonly PopulatedPlace[],
  entities: readonly Entity[],
  reviewedAt: string,
  count = 300,
): Fact[] {
  const byCode = new Map(entities.map((e) => [e.id.slice("country:".length), e] as const));
  const capitalNames = new Set(
    entities.flatMap((e) => (e.capitals ?? []).map((c) => `${e.id}|${c.name.toLowerCase()}`)),
  );
  const top = places
    .filter(
      (p) =>
        byCode.has(p.country) &&
        !p.capital &&
        !capitalNames.has(`country:${p.country}|${p.name.toLowerCase()}`),
    )
    .sort((a, b) => b.pop - a.pop || a.name.localeCompare(b.name))
    .slice(0, count);
  return top.map((p, i) => {
    const e = byCode.get(p.country) as Entity;
    return fact.parse({
      id: `fact:${String(9001 + i).padStart(4, "0")}`,
      text: `Pin the city of ${p.name}, in ${e.names.canonical}.`,
      answer_label: p.name,
      category: "capitals-and-cities",
      era: "contemporary",
      precision: "city",
      target: { type: "point", coords: [r6(p.lat), r6(p.lon)] },
      tolerance_km: 20,
      reveal: `${p.name} is a major city in ${e.names.canonical}.`,
      sources: [
        {
          title: "Natural Earth populated places",
          url: "https://www.naturalearthdata.com/",
          license: "Public domain",
        },
      ],
      difficulty: Math.round((0.2 + 0.6 * (i / Math.max(1, top.length - 1))) * 100) / 100,
      entities: [e.id],
      status: "published",
      reviewed_at: reviewedAt,
      review_due: null,
      continent: continentOf(e),
      generated: true,
    });
  });
}

/** All facts of a build, sorted by id. */
export function buildFacts(input: {
  authored: readonly { file: z.infer<typeof authoredFile> }[];
  entities: readonly Entity[];
  places: readonly PopulatedPlace[];
  reviewedAt: string;
}): Fact[] {
  const byId = new Map(input.entities.map((e) => [e.id, e] as const));
  const curated = input.authored.flatMap(({ file }) =>
    file.facts.map((a) => toFact(a, file.reviewed_at ?? input.reviewedAt, byId)),
  );
  const all = [
    ...curated,
    ...capitalFacts(input.entities, input.reviewedAt),
    ...cityFacts(input.places, input.entities, input.reviewedAt),
  ];
  const seen = new Set<string>();
  for (const f of all) {
    if (seen.has(f.id)) throw new Error(`duplicate fact id ${f.id}`);
    seen.add(f.id);
  }
  return all.sort((a, b) => a.id.localeCompare(b.id));
}
