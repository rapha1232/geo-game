import { EARTH_RADIUS_KM, type LatLon } from "./sphere";

/** GeoJSON-style positions: [lon, lat]. A polygon is [outer, ...holes]. */
export type Ring = ReadonlyArray<readonly [number, number]>;
export type Polygon = ReadonlyArray<Ring>;
export type MultiPolygon = ReadonlyArray<Polygon>;

/** Make longitudes continuous along the ring so shapes crossing ±180° are not split. */
function unwrap(ring: Ring): [number, number][] {
  const out: [number, number][] = [];
  let prev: number | undefined;
  for (const [lon, lat] of ring) {
    let l = lon;
    if (prev !== undefined) {
      while (l - prev > 180) l -= 360;
      while (l - prev < -180) l += 360;
    }
    out.push([l, lat]);
    prev = l;
  }
  return out;
}

function crosses(ring: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRing(ring: Ring, p: LatLon): boolean {
  const r = unwrap(ring);
  // The ring may live anywhere in [-540, 540] after unwrapping; try each 360° copy of the point.
  return [-360, 0, 360].some((shift) => crosses(r, p.lon + shift, p.lat));
}

/** Point in polygon (outer ring minus holes), antimeridian-aware. */
export function pointInPolygon(p: LatLon, polygon: Polygon): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !inRing(outer, p)) return false;
  return !holes.some((h) => inRing(h, p));
}

export function pointInMultiPolygon(p: LatLon, mp: MultiPolygon): boolean {
  return mp.some((poly) => pointInPolygon(p, poly));
}

type V3 = [number, number, number];
const toVec = (lat: number, lon: number): V3 => {
  const φ = (lat * Math.PI) / 180;
  const λ = (lon * Math.PI) / 180;
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
};
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): number => Math.sqrt(dot(a, a));
/** Angle between unit vectors, stable for tiny and near-antipodal values. */
const angle = (a: V3, b: V3): number => Math.atan2(norm(cross(a, b)), dot(a, b));

/** Angular distance (radians) from unit vector p to the great-circle arc a→b. */
function arcDistance(p: V3, a: V3, b: V3): number {
  const n = cross(a, b);
  const nl = norm(n);
  const ends = Math.min(angle(p, a), angle(p, b));
  if (nl < 1e-12) return ends; // degenerate segment
  const nn: V3 = [n[0] / nl, n[1] / nl, n[2] / nl];
  const s = dot(p, nn);
  // Foot of the perpendicular on the great circle.
  const c: V3 = [p[0] - s * nn[0], p[1] - s * nn[1], p[2] - s * nn[2]];
  if (norm(c) < 1e-12) return ends; // p is the circle's pole
  const onArc = dot(cross(a, c), nn) >= 0 && dot(cross(c, b), nn) >= 0;
  return onArc ? Math.min(ends, Math.asin(Math.min(1, Math.abs(s)))) : ends;
}

/** Geodesic distance (km) from a point to the nearest boundary vertex or edge of the rings. */
export function distanceToBoundaryKm(p: LatLon, rings: ReadonlyArray<Ring>): number {
  const pv = toVec(p.lat, p.lon);
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i] as readonly [number, number];
      const b = ring[i + 1] as readonly [number, number];
      best = Math.min(best, arcDistance(pv, toVec(a[1], a[0]), toVec(b[1], b[0])));
    }
  }
  return best * EARTH_RADIUS_KM;
}

/** Fact Pin area distance (fact-pin §5): 0 inside any polygon, else distance to the nearest boundary. */
export function distanceToAreaKm(p: LatLon, area: MultiPolygon): number {
  if (pointInMultiPolygon(p, area)) return 0;
  return distanceToBoundaryKm(p, area.flat());
}
