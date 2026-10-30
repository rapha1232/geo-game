import { feature } from "topojson-client";
import { geoBounds, geoContains, type GeoPermissibleObjects } from "d3-geo";
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
      bounds: geoBounds(f.geometry) as [[number, number], [number, number]],
    });
  }
  return out;
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
