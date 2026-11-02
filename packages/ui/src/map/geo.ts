import { feature } from "topojson-client";
import { geoContains, type GeoPermissibleObjects } from "d3-geo";
import type { GeometryCollection, Topology } from "topojson-specification";

/** One decoded feature of a geometry pack, ready for projection and hit testing. */
export type MapFeature = {
  id: string;
  geometry: GeoPermissibleObjects;
  /** [[west, south], [east, north]]; west > east when it crosses the antimeridian */ bounds: [
    [number, number],
    [number, number],
  ];
};

/** Decodes `objects.countries` of a TopoJSON pack. Features without an id are skipped. */
export function decodeFeatures(topology: Topology): MapFeature[] {
  const object = topology.objects["countries"] as GeometryCollection | undefined;
  if (!object) return [];
  const fc = feature(topology, object) as unknown as {
    features: { id?: string | number; geometry: GeoPermissibleObjects | null }[];
  };
  const out: MapFeature[] = [];
  for (const f of fc.features) {
    if (f.id === undefined || !f.geometry) continue;
    out.push({
      id: String(f.id),
      geometry: f.geometry,
      bounds: lonLatBounds(f.geometry),
    });
  }
  return out;
}

/**
 * [[west, south], [east, north]] of a feature from its coordinates. A min/max pass instead of d3's spherical
 * geoBounds, which cost over 200 ms on the 10m pack. The boxes only pre-filter the exact hit test, so planar is
 * enough, with one care: a feature across the antimeridian gets the narrower box that wraps (west > east).
 */
export function lonLatBounds(geometry: GeoPermissibleObjects): MapFeature["bounds"] {
  let [w, e, s, n] = [Infinity, -Infinity, Infinity, -Infinity];
  // The same box with western-hemisphere longitudes moved past 180, for features that cross the antimeridian.
  let [w2, e2] = [Infinity, -Infinity];
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") {
      const [lon, lat] = c as [number, number];
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
      const l2 = lon < 0 ? lon + 360 : lon;
      if (l2 < w2) w2 = l2;
      if (l2 > e2) e2 = l2;
      return;
    }
    for (const x of c) walk(x);
  };
  const g = geometry as { coordinates?: unknown; geometries?: { coordinates?: unknown }[] };
  if (g.geometries) for (const x of g.geometries) walk(x.coordinates);
  else walk(g.coordinates);
  if (w === Infinity)
    return [
      [0, 0],
      [0, 0],
    ];
  // Wrapping is narrower: report it as west > east, the convention inBounds understands.
  if (e2 - w2 < e - w)
    return [
      [w2 > 180 ? w2 - 360 : w2, s],
      [e2 > 180 ? e2 - 360 : e2, n],
    ];
  return [
    [w, s],
    [e, n],
  ];
}

const inBounds = ([[w, s], [e, n]]: MapFeature["bounds"], lon: number, lat: number): boolean =>
  lat >= s && lat <= n && (w <= e ? lon >= w && lon <= e : lon >= w || lon <= e);

/** The feature containing a [lon, lat] point, or null (open water). Bounds are checked first so most features cost nothing. */
export function featureAt(
  features: readonly MapFeature[],
  lon: number,
  lat: number,
): string | null {
  for (const f of features)
    if (inBounds(f.bounds, lon, lat) && geoContains(f.geometry, [lon, lat])) return f.id;
  return null;
}

/** Pin coordinates are stored to 4 decimals (fact-pin §5). */
export const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
