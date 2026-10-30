import polylabel from "polylabel";
import { pointInPolygon, type Polygon } from "@meridian/geo";
import { round6 } from "./util.ts";

export type Position = [number, number];
export type Ring = Position[];
export type PolygonCoords = Ring[];
export type Geometry =
  | { type: "Polygon"; coordinates: PolygonCoords }
  | { type: "MultiPolygon"; coordinates: PolygonCoords[] };

export const polygonsOf = (g: Geometry): PolygonCoords[] =>
  g.type === "Polygon" ? [g.coordinates] : g.coordinates;

/** Planar shoelace area of a lon/lat ring. Negative = clockwise (x east, y north). */
export function signedArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as Position;
    const [xj, yj] = ring[j] as Position;
    a += xj * yi - xi * yj;
  }
  return a / 2;
}

/**
 * Pack winding convention (the d3-geo spherical one): exterior rings clockwise, holes counter-clockwise,
 * measured in lon/lat. Rings are closed, rounded to 6 decimals, and consecutive duplicates are dropped.
 */
export function normalizeGeometry(g: Geometry): Geometry {
  const fixRing = (ring: Ring, exterior: boolean): Ring => {
    const out: Ring = [];
    for (const [x, y] of ring) {
      const p: Position = [round6(x), round6(y)];
      const prev = out[out.length - 1];
      if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
    }
    const first = out[0];
    const last = out[out.length - 1];
    if (first && last && (first[0] !== last[0] || first[1] !== last[1]))
      out.push([first[0], first[1]]);
    const clockwise = signedArea(out) < 0;
    return clockwise === exterior ? out : out.reverse();
  };
  const fixPoly = (p: PolygonCoords): PolygonCoords => p.map((r, i) => fixRing(r, i === 0));
  return g.type === "Polygon"
    ? { type: "Polygon", coordinates: fixPoly(g.coordinates) }
    : { type: "MultiPolygon", coordinates: g.coordinates.map(fixPoly) };
}

/**
 * Removes polygons whose exterior area is below `minArea` (square degrees) and holes smaller than that.
 * Used after normalization: shapes smaller than one quantization cell would collapse to zero area.
 * Returns null when nothing is left, so the caller can fail instead of shipping an empty country.
 */
export function dropSlivers(g: Geometry, minArea: number): Geometry | null {
  const keep = (p: PolygonCoords): PolygonCoords | null => {
    const [outer, ...holes] = p;
    if (!outer || Math.abs(signedArea(outer)) < minArea) return null;
    return [outer, ...holes.filter((h) => Math.abs(signedArea(h)) >= minArea)];
  };
  const polys = polygonsOf(g)
    .map(keep)
    .filter((p): p is PolygonCoords => p !== null);
  if (polys.length === 0) return null;
  return polys.length === 1 && g.type === "Polygon"
    ? { type: "Polygon", coordinates: polys[0] as PolygonCoords }
    : { type: "MultiPolygon", coordinates: polys };
}

const EARTH_RADIUS_M = 6378137;
const rad = (d: number): number => (d * Math.PI) / 180;

/** Spherical ring area (m²), the standard lon/lat approximation. Used only to rank polygons by size. */
export function ringAreaM2(ring: Ring): number {
  let total = 0;
  const n = ring.length;
  if (n < 4) return 0;
  for (let i = 0; i < n - 1; i++) {
    const [x1, y1] = ring[i] as Position;
    const [x2, y2] = ring[i + 1] as Position;
    total += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

export function polygonAreaM2(p: PolygonCoords): number {
  const [outer, ...holes] = p;
  if (!outer) return 0;
  return ringAreaM2(outer) - holes.reduce((s, h) => s + ringAreaM2(h), 0);
}

export function largestPolygon(g: Geometry): PolygonCoords {
  let best: PolygonCoords | undefined;
  let bestArea = -1;
  for (const p of polygonsOf(g)) {
    const a = polygonAreaM2(p);
    if (a > bestArea) {
      best = p;
      bestArea = a;
    }
  }
  if (!best) throw new Error("geometry has no polygons");
  return best;
}

/**
 * `[minLon, minLat, maxLon, maxLat]`. Shapes that straddle the antimeridian (Fiji, Russia) get minLon > maxLon:
 * the box is the complement of the widest empty longitude gap, so it stays small. Shapes with no gap wider
 * than 45° circle the globe, so their box is the full -180..180.
 */
export function boundingBox(g: Geometry): [number, number, number, number] {
  const lons = new Set<number>();
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const poly of polygonsOf(g)) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        lons.add(x);
        if (y < minLat) minLat = y;
        if (y > maxLat) maxLat = y;
      }
    }
  }
  const sorted = [...lons].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) throw new Error("geometry has no coordinates");
  let gap = first + 360 - last; // the wrap-around gap
  let westIdx = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const d = (sorted[i + 1] as number) - (sorted[i] as number);
    if (d > gap) {
      gap = d;
      westIdx = i + 1;
    }
  }
  // Even the widest empty gap is small: the shape goes all the way round the globe (Antarctica).
  if (gap < 45) return [-180, minLat, 180, maxLat];
  if (westIdx === 0) return [first, minLat, last, maxLat];
  return [sorted[westIdx] as number, minLat, sorted[westIdx - 1] as number, maxLat];
}

/**
 * Pole of inaccessibility of the largest polygon (silhouette §5.3): `polylabel` at min(0.01°, a hundredth of the
 * polygon's smaller side) in an equirectangular frame scaled by cos(latitude). Returns [lat, lon].
 */
export function refPoint(g: Geometry): [number, number] {
  const poly = largestPolygon(g);
  const outer = poly[0] as Ring;
  const midLat = (Math.min(...outer.map((p) => p[1])) + Math.max(...outer.map((p) => p[1]))) / 2;
  const k = Math.max(0.05, Math.cos(rad(midLat)));
  const scaled = poly.map((r) => r.map(([x, y]) => [x * k, y] as Position));
  // 0.01° is too coarse for microstates (the Vatican is about 0.0013° wide), so precision follows the shape's size.
  const xs = scaled[0]?.map((p) => p[0]) ?? [0];
  const ys = scaled[0]?.map((p) => p[1]) ?? [0];
  const smallerSide = Math.min(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
  const precision = Math.min(0.01, smallerSide / 100);
  const [px, py] = polylabel(scaled, precision) as [number, number];
  return [round6(py), round6(px / k)];
}

/** True when the point lies inside the polygon (REF_POINT_OUTSIDE). Input is [lat, lon]. */
export function pointInsideLargest(g: Geometry, [lat, lon]: [number, number]): boolean {
  const poly = largestPolygon(g) as unknown as Polygon;
  return pointInPolygon({ lat, lon }, poly);
}
