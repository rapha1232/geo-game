/** Spherical geometry (silhouette §5.3). Pure functions, no I/O. */

export type LatLon = { lat: number; lon: number };

/** Mean Earth radius in km (normative). */
export const EARTH_RADIUS_KM = 6371.0088;
/** Half the Earth's circumference in km (normative, proximity denominator). */
export const HALF_CIRCUMFERENCE_KM = 20015.1;
export const KM_PER_MILE = 1.609344;

export const SECTORS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Sector8 = (typeof SECTORS_8)[number];

const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/** Great-circle distance in km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const p1 = rad(a.lat);
  const p2 = rad(b.lat);
  const dp = p2 - p1;
  const dl = rad(b.lon - a.lon);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whole-km display value. */
export const roundKm = (km: number): number => Math.round(km);

/**
 * Rhumb-line (constant) bearing from `from` to `to`, degrees in [0, 360).
 * Longitude difference takes the shorter way round, crossing the antimeridian when shorter.
 */
export function rhumbBearing(from: LatLon, to: LatLon): number {
  // Clamp so the Mercator ordinate stays finite at the poles.
  const clamp = (lat: number): number => Math.max(-89.999999, Math.min(89.999999, lat));
  const p1 = rad(clamp(from.lat));
  const p2 = rad(clamp(to.lat));
  let dl = rad(to.lon - from.lon);
  dl = ((((dl + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  // Exactly opposite meridians: east, matching the spec's antipodal fixture.
  if (dl === -Math.PI) dl = Math.PI;
  const dpsi = Math.log(Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2));
  const bearing = deg(Math.atan2(dl, dpsi));
  const normalized = ((bearing % 360) + 360) % 360;
  return normalized === 360 ? 0 : normalized;
}

/** 8 sectors of 45°: N = [337.5, 22.5), NE = [22.5, 67.5), ... */
export function sector8(bearingDeg: number): Sector8 {
  const b = ((bearingDeg % 360) + 360) % 360;
  const idx = Math.floor(((b + 22.5) % 360) / 45);
  return SECTORS_8[idx] as Sector8;
}

/** Proximity %: a correct guess is 100, a wrong guess is capped at 99. */
export function proximityPercent(distanceKm: number, correct: boolean): number {
  if (correct) return 100;
  const p = Math.floor(100 * (1 - distanceKm / HALF_CIRCUMFERENCE_KM));
  return Math.max(0, Math.min(99, p));
}
