import { z } from "zod";
import { bbox, countryId, entityId, latLon, territoryId, ENTITY_TYPES } from "./ids";

/** Alias kinds (DATA_AND_CONTENT §5.1). */
export const ALIAS_KINDS = [
  "canonical",
  "common",
  "official",
  "ascii",
  "former",
  "endonym",
  "translation",
  "code",
  "misspelling",
] as const;
export const aliasKind = z.enum(ALIAS_KINDS);
export type AliasKind = z.infer<typeof aliasKind>;

export const alias = z.object({
  text: z.string().min(1),
  kind: aliasKind,
  lang: z
    .string()
    .regex(/^[a-z]{2,3}$/)
    .optional(),
  script: z
    .string()
    .regex(/^[A-Z][a-z]{3}$/)
    .optional(),
});
export type Alias = z.infer<typeof alias>;

export const SETS = ["sovereign-197", "un-193", "territories"] as const;

export const capital = z.object({
  city: z.string().optional(),
  name: z.string().min(1),
  // Exactly the roles in quiz-library §5.5. A planned capital is expressed with `valid_from` (DATA_AND_CONTENT §7.1).
  role: z.enum(["official", "constitutional", "seat_of_government"]),
  valid_from: z.string().optional(),
  note: z.string().optional(),
});

const difficulty = z.object({
  recall: z.number().min(0).max(1),
  locate: z.number().min(0).max(1),
  flag: z.number().min(0).max(1),
  capital: z.number().min(0).max(1),
  shape: z.number().min(0).max(1),
});

/** Common fields of every geographic entity (DATA_MODEL §2.2). */
export const entity = z
  .object({
    id: entityId,
    type: z.enum(ENTITY_TYPES),
    names: z.object({ canonical: z.string().min(1), aliases: z.array(alias) }),
    external_ids: z.record(z.string(), z.union([z.string(), z.number()])),
    label_point: latLon,
    ref_point: latLon.optional(),
    bbox,
    parent_ids: z.array(entityId),
    sets: z.array(z.enum(SETS)).optional(),
    not_in_set_reason: z.string().min(1).optional(),
    sovereign_of: countryId.optional(),
    valid_from: z.string().optional(),
    valid_to: z.string().optional(),
    difficulty: difficulty.optional(),
    source_ids: z.array(z.string().min(1)).min(1),
    // Country-specific.
    continent: z.string().optional(),
    subregion: z.string().optional(),
    capitals: z.array(capital).optional(),
    flag: z
      .object({ svg: z.string(), aspect: z.number().positive(), confusables: z.array(countryId) })
      .optional(),
    population: z
      .object({ value: z.number().nonnegative(), year: z.number().int(), source: z.string() })
      .optional(),
    area_km2: z.object({ value: z.number().nonnegative(), source: z.string() }).optional(),
  })
  .superRefine((e, ctx) => {
    const prefix = e.id.slice(0, e.id.indexOf(":"));
    if (prefix !== e.type)
      ctx.addIssue({
        code: "custom",
        path: ["type"],
        message: `id prefix "${prefix}" does not match type "${e.type}"`,
      });
    const isCountryLike = e.type === "country" || e.type === "territory";
    if (isCountryLike && !e.ref_point)
      ctx.addIssue({
        code: "custom",
        path: ["ref_point"],
        message: "ref_point is required for countries and territories",
      });
    if (isCountryLike && !e.sets)
      ctx.addIssue({
        code: "custom",
        path: ["sets"],
        message: "sets is required for countries and territories",
      });
    if (e.type === "territory" && !e.sovereign_of && !e.not_in_set_reason) {
      ctx.addIssue({
        code: "custom",
        path: ["sovereign_of"],
        message: "a territory needs sovereign_of or not_in_set_reason",
      });
    }
    if (e.valid_from && e.valid_to && e.valid_to < e.valid_from)
      ctx.addIssue({
        code: "custom",
        path: ["valid_to"],
        message: "valid_to is before valid_from",
      });
    if (!e.names.aliases.every((a) => a.kind !== "canonical")) {
      ctx.addIssue({
        code: "custom",
        path: ["names", "aliases"],
        message: "the canonical name is names.canonical, not an alias",
      });
    }
  });
export type Entity = z.infer<typeof entity>;

/** Ambiguity groups (DATA_MODEL §2.4). */
export const ambiguityGroup = z.object({
  group: z.string().min(1),
  alias: z.string().min(1),
  universe: z.string().min(1),
  members: z.array(entityId).min(2),
  message: z.string().min(1),
});
export type AmbiguityGroup = z.infer<typeof ambiguityGroup>;

/** Adjacency and crossings (DATA_MODEL §2.5). Canonical order: a < b. */
export const adjacencyEdge = z
  .object({
    a: z.union([countryId, territoryId]),
    b: z.union([countryId, territoryId]),
    length_km: z.number().nonnegative().optional(),
    disputed: z.boolean().optional(),
    via: z.string().optional(),
    type: z.string().optional(),
    name: z.string().optional(),
    crossing: z.boolean().optional(),
  })
  .superRefine((e, ctx) => {
    if (e.a === e.b) ctx.addIssue({ code: "custom", path: ["b"], message: "self-edge" });
    else if (e.a > e.b)
      ctx.addIssue({
        code: "custom",
        path: ["a"],
        message: "edge is not in canonical order (a < b)",
      });
  });
export type AdjacencyEdge = z.infer<typeof adjacencyEdge>;
