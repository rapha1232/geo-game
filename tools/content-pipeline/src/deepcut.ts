import type { Entity } from "@meridian/schemas";
import { norm } from "@meridian/name-matcher";
import { polygonsOf, type Geometry, type Ring } from "./geometry.ts";
import type { LanguagesSnapshot } from "./languages.ts";

/** One Deep Cut prompt (deep-cut §4.3). */
export type DeepCutPrompt = {
  id: string;
  family: string;
  text: string;
  answers: string[];
  /** Shown on the reveal, with the source of the data. */
  explanation: string;
  /** Explains a wrong answer; `{name}` is the country picked. */
  invalid: string;
  /** Prior obviousness `o` per answer, 0 (rare) to 1 (the first to come to mind). */
  rarity_prior: Record<string, number>;
};

export const MIN_ANSWERS = 4;
export const MAX_ANSWERS = 30;
const CONTINENTS: Record<string, string> = {
  AF: "Africa",
  AS: "Asia",
  EU: "Europe",
  NA: "North America",
  OC: "Oceania",
  SA: "South America",
};
const TROPIC = 23.4363;

/** An editorial addition to a computed prompt, with its source (content/deepcut-overrides.yaml). */
export type DeepCutOverride = { prompt: string; add: string[]; source: string; reason: string };

export type DeepCutInput = {
  /** Editorial additions; each must name an existing prompt and real countries. */
  overrides?: readonly DeepCutOverride[];
  entities: readonly Entity[];
  edges: readonly { a: string; b: string }[];
  geometry: ReadonlyMap<string, Geometry>;
  languages: LanguagesSnapshot;
};

const continentOf = (e: Entity): string =>
  e.parent_ids.find((p) => p.startsWith("continent:"))?.slice("continent:".length) ?? "";

/** True when any ring has an edge that crosses (or touches) the parallel at `lat`. */
export function crossesLatitude(g: Geometry, lat: number): boolean {
  return polygonsOf(g).some((poly) =>
    (poly[0] as Ring).some((p, i, ring) => {
      const q = ring[i + 1];
      return !!q && Math.min(p[1], q[1]) <= lat && Math.max(p[1], q[1]) >= lat;
    }),
  );
}

/** True when any ring has an edge that crosses the meridian at `lon` (edges that wrap the antimeridian are ignored). */
export function crossesLongitude(g: Geometry, lon: number): boolean {
  return polygonsOf(g).some((poly) =>
    (poly[0] as Ring).some((p, i, ring) => {
      const q = ring[i + 1];
      return (
        !!q &&
        Math.abs(p[0] - q[0]) < 180 &&
        Math.min(p[0], q[0]) <= lon &&
        Math.max(p[0], q[0]) >= lon
      );
    }),
  );
}

const familiarity = (e: Entity): number => 1 - (e.difficulty?.recall ?? 0.5);

/** `o = 0.6 × familiarity + 0.4 × typicality`, typicality 0.5 unless the family knows better (deep-cut §6.2). */
const prior = (e: Entity, typicality = 0.5): number =>
  Math.round((0.6 * familiarity(e) + 0.4 * typicality) * 1000) / 1000;

/**
 * The prompt pool from data the pipeline already has (deep-cut §4.2): official languages, neighbours, continent and
 * attribute pairs, lines of latitude and longitude, name shapes, and size rankings. Families that need curated data
 * (flag colours, bodies of water) are not generated. Only instances with 4 to 30 answers are kept. Deterministic.
 */
export function generatePrompts(input: DeepCutInput): DeepCutPrompt[] {
  const sovereign = input.entities.filter((e) => e.sets?.includes("sovereign-197"));
  const byId = new Map(sovereign.map((e) => [e.id, e]));
  const out: DeepCutPrompt[] = [];
  const add = (
    p: Omit<DeepCutPrompt, "answers" | "rarity_prior"> & {
      who: Entity[];
      typ?: (e: Entity) => number;
    },
  ) => {
    const who = [...new Map(p.who.map((e) => [e.id, e])).values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    if (who.length < MIN_ANSWERS || who.length > MAX_ANSWERS) return;
    const { who: _w, typ, ...rest } = p;
    out.push({
      ...rest,
      answers: who.map((e) => e.id),
      rarity_prior: Object.fromEntries(who.map((e) => [e.id, prior(e, typ?.(e))])),
    });
  };

  // Languages (Wikidata P37).
  const byLang = new Map<string, Entity[]>();
  for (const e of sovereign)
    for (const l of input.languages.languages[e.id.slice("country:".length)] ?? [])
      (byLang.get(l) ?? byLang.set(l, []).get(l)!).push(e);
  for (const [lang, who] of [...byLang].sort(([a], [b]) => a.localeCompare(b)))
    add({
      id: `prompt:lang-${norm(lang).replaceAll(" ", "-")}`,
      family: "language",
      text: `${lang} is an official language`,
      explanation: `Official status as recorded in Wikidata (P37, ${input.languages.retrieved_on}); unreviewed.`,
      invalid: `{name}: ${lang} is not an official language.`,
      who,
    });

  // Neighbours (core.adjacency).
  const nb = new Map<string, Set<string>>();
  for (const { a, b } of input.edges)
    if (byId.has(a) && byId.has(b)) {
      (nb.get(a) ?? nb.set(a, new Set()).get(a)!).add(b);
      (nb.get(b) ?? nb.set(b, new Set()).get(b)!).add(a);
    }
  for (const [id, set] of [...nb].sort(([a], [b]) => a.localeCompare(b))) {
    const target = byId.get(id) as Entity;
    add({
      id: `prompt:borders-${id.slice("country:".length)}`,
      family: "neighbors",
      text: `Borders ${target.names.canonical}`,
      explanation: "Land borders from the Natural Earth boundaries, with editorial overrides.",
      invalid: `{name} does not border ${target.names.canonical}.`,
      who: [...set].map((x) => byId.get(x) as Entity),
    });
  }

  // Continent and an attribute.
  for (const [code, label] of Object.entries(CONTINENTS)) {
    const here = sovereign.filter((e) => continentOf(e) === code);
    const attrs: [string, string, (e: Entity) => boolean][] = [
      ["landlocked", "landlocked", (e) => e.landlocked === true],
      ["island", "an island nation with no land border", (e) => !nb.has(e.id)],
      ["big", "home to more than 50 million people", (e) => (e.population?.value ?? 0) > 50e6],
      [
        "small",
        "home to fewer than 1 million people",
        (e) => (e.population?.value ?? Infinity) < 1e6,
      ],
    ];
    for (const [slug, text, test] of attrs)
      add({
        id: `prompt:${code}-${slug}`,
        family: "two-attribute",
        text: `In ${label} and ${text}`,
        explanation:
          "Continent from Natural Earth; population from the content release; borders from the adjacency data.",
        invalid: `{name} is not in ${label} and ${text}.`,
        who: here.filter(test),
      });
  }

  // Lines of latitude and longitude, from the 1:10m outlines.
  const lines: [string, string, (g: Geometry) => boolean][] = [
    ["equator", "the equator", (g) => crossesLatitude(g, 0)],
    ["tropic-of-cancer", "the Tropic of Cancer", (g) => crossesLatitude(g, TROPIC)],
    ["tropic-of-capricorn", "the Tropic of Capricorn", (g) => crossesLatitude(g, -TROPIC)],
    ["prime-meridian", "the Prime Meridian", (g) => crossesLongitude(g, 0)],
  ];
  for (const [slug, label, test] of lines)
    add({
      id: `prompt:line-${slug}`,
      family: "lines",
      text: `Crossed by ${label}`,
      explanation: "Computed from the 1:10m country outlines.",
      invalid: `{name} is not crossed by ${label}.`,
      who: sovereign.filter((e) => {
        const g = input.geometry.get(e.id);
        return g ? test(g) : false;
      }),
    });

  // Name shapes.
  add({
    id: "prompt:name-stan",
    family: "names",
    text: "Name ends in -stan",
    explanation: "Based on each country's common English name.",
    invalid: "{name} does not end in -stan.",
    who: sovereign.filter((e) => /stan$/i.test(e.names.canonical)),
  });
  const letters = new Set(sovereign.map((e) => e.names.canonical[0]?.toUpperCase() ?? ""));
  for (const l of [...letters].sort())
    if (/^[A-Z]$/.test(l))
      add({
        id: `prompt:name-letter-${l}`,
        family: "names",
        text: `Name is a single word starting with ${l}`,
        explanation: "Based on each country's common English name.",
        invalid: `{name} is not a single word starting with ${l}.`,
        who: sovereign.filter(
          (e) => !/\s/.test(e.names.canonical) && e.names.canonical.toUpperCase().startsWith(l),
        ),
      });

  // Rankings.
  for (const [code, label] of Object.entries(CONTINENTS)) {
    const here = sovereign.filter((e) => continentOf(e) === code);
    for (const [slug, text, top, key] of [
      ["area", "largest by area", 20, (e: Entity) => e.area_km2?.value ?? 0],
      ["population", "most populous", 10, (e: Entity) => e.population?.value ?? 0],
    ] as const) {
      if (here.length <= top) continue;
      add({
        id: `prompt:rank-${slug}-${code}`,
        family: "rankings",
        text: `Among the ${top} ${text} in ${label}`,
        explanation: "Ranked from the area and population in the content release.",
        invalid: `{name} is not among the ${top} ${text} in ${label}.`,
        who: [...here].sort((a, b) => key(b) - key(a) || a.id.localeCompare(b.id)).slice(0, top),
      });
    }
  }
  for (const o of input.overrides ?? []) {
    const p = out.find((x) => x.id === o.prompt);
    if (!p) throw new Error(`deepcut override names an unknown prompt: ${o.prompt}`);
    for (const id of o.add) {
      const e = byId.get(id);
      if (!e) throw new Error(`deepcut override adds ${id}, which is not a sovereign country`);
      if (!p.answers.includes(id)) {
        p.answers.push(id);
        p.rarity_prior[id] = prior(e);
      }
    }
    p.answers.sort();
    p.rarity_prior = Object.fromEntries(
      Object.entries(p.rarity_prior).sort(([a], [b]) => a.localeCompare(b)),
    );
    if (p.answers.length > MAX_ANSWERS)
      throw new Error(
        `${p.id} has ${p.answers.length} answers after the override, the limit is ${MAX_ANSWERS}`,
      );
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
