import { haversineKm, distanceToAreaKm, type MultiPolygon } from "@meridian/geo";
import {
  DEFAULT_TOLERANCE_KM,
  HINT_CAP,
  MAX_SCORE,
  SCALE_KM,
  type Hint,
  type PinFact,
  type Pin,
  type Precision,
} from "./types";

/** Area geometry by entity or feature id (1:10m for the inside test, 50m for the boundary). Injected: the engine loads nothing. */
export type AreaResolver = (id: string) => MultiPolygon | undefined;

/** Pins are stored to 4 decimals (fact-pin §5). */
export const roundPin = (p: Pin): Pin => ({
  lat: Math.round(p.lat * 1e4) / 1e4,
  lon: Math.round(p.lon * 1e4) / 1e4,
});

/**
 * Distance in km from the pin to the target (fact-pin §5): a point target is `max(0, haversine − tolerance)`, an area
 * target is 0 inside any polygon and the distance to the nearest boundary otherwise.
 */
export function distanceToTarget(fact: PinFact, pin: Pin, areas: AreaResolver): number {
  const t = fact.target;
  if (t.type === "point") {
    const tol = fact.toleranceKm ?? DEFAULT_TOLERANCE_KM[fact.precision];
    return Math.max(0, haversineKm(pin, { lat: t.coords[0], lon: t.coords[1] }) - tol);
  }
  const area = areas(t.type === "entity" ? t.id : t.ref);
  if (!area) throw new RangeError(`no geometry for ${t.type === "entity" ? t.id : t.ref}`);
  return distanceToAreaKm(pin, area);
}

/** `round(1000 × exp(−d / s))` with the scale of the precision class (fact-pin §6.1). */
export const rawScore = (distanceKm: number, precision: Precision): number =>
  Math.round(MAX_SCORE * Math.exp(-distanceKm / SCALE_KM[precision]));

/** The lowest cap among the hints used (a cap, not a deduction), or null for none. */
export const capFor = (hints: readonly Hint[]): number | null =>
  hints.length === 0 ? null : Math.min(...hints.map((h) => HINT_CAP[h]));

export const applyCap = (score: number, cap: number | null): number =>
  cap === null ? score : Math.min(cap, score);

export function ratingOf(total: number): "Pinpoint" | "Sharp" | "On the map" | "Exploring" {
  if (total >= 4500) return "Pinpoint";
  if (total >= 3500) return "Sharp";
  if (total >= 2000) return "On the map";
  return "Exploring";
}

/** The country hint is only offered for exact, city and region facts that lie in a known country. */
export const countryHintAllowed = (fact: PinFact): boolean =>
  (fact.precision === "exact" || fact.precision === "city" || fact.precision === "region") &&
  (fact.countries?.length ?? 0) > 0;
