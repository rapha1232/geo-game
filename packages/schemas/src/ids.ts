import { z } from "zod";

/** Stable identifiers (DATA_MODEL "Stable identifiers"). */
const slug = "[a-z0-9]+(?:-[a-z0-9]+)*";

export const countryId = z.string().regex(/^country:[A-Z]{3}$/, "country:<alpha-3>");
export const territoryId = z.string().regex(/^territory:[A-Z]{3}$/, "territory:<alpha-3>");
export const continentId = z
  .string()
  .regex(/^continent:(AF|AN|AS|EU|NA|OC|SA)$/, "continent:<code>");
export const regionId = z.string().regex(new RegExp(`^region:${slug}$`));
export const subdivisionId = z.string().regex(/^subdivision:[A-Z]{2}-[A-Z0-9]{1,3}$/);
export const cityId = z.string().regex(/^city:gn-\d+$/);
export const featureId = z.string().regex(new RegExp(`^feature:${slug}$`));
export const placeId = z.string().regex(new RegExp(`^place:${slug}$`));
export const factId = z.string().regex(/^fact:\d{4,}$/);
export const promptId = z.string().regex(new RegExp(`^prompt:${slug}$`));
export const eventId = z.string().regex(new RegExp(`^event:${slug}$`));
export const personId = z.string().regex(new RegExp(`^person:${slug}$`));
export const polityId = z.string().regex(new RegExp(`^polity:${slug}$`));
export const sliceId = z.string().regex(/^slice:-?\d+$/);
export const achievementId = z.string().regex(/^ACH-[A-Z]{2,4}-[A-Z0-9]+$/);

/** Any entity ID that can appear in a quiz or on a map. */
export const entityId = z.union([
  countryId,
  territoryId,
  continentId,
  regionId,
  subdivisionId,
  cityId,
  featureId,
  placeId,
]);
export type EntityId = z.infer<typeof entityId>;

export const ENTITY_TYPES = [
  "country",
  "territory",
  "continent",
  "region",
  "subdivision",
  "city",
  "feature",
  "place",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** The prefix of an ID is its type. */
export const idPrefix = (id: string): string => id.slice(0, id.indexOf(":"));

/** 10-character Crockford base32 (no I, L, O, U). */
export const seed = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{10}$/, "10-character Crockford base32 seed");
/** ULID (Crockford base32, 26 characters). */
export const ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "ULID");
/** Content version `YYYY.MM.N`. */
export const contentVersion = z.string().regex(/^\d{4}\.(0[1-9]|1[0-2])\.\d+$/, "YYYY.MM.N");
/** `YYYY-MM-DD`, and a real calendar date. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, "not a real calendar date");
export const isoDateTime = z.string().datetime();
export const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

/** Latitude, longitude pair in degrees. */
export const latLon = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
/** `[minLon, minLat, maxLon, maxLat]`. Longitudes may wrap, so min may exceed max across the antimeridian. */
export const bbox = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
