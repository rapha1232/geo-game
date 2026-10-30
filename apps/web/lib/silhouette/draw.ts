import { geoAzimuthalEqualArea, geoBounds, geoPath } from "d3-geo";

export const VIEW = 400;
const PADDING = 0.08;

/** Center of the shape's bounds, longitude-wrapped so shapes across the antimeridian (Fiji, Kiribati) stay whole. */
function center(g: GeoJSON.Geometry): [number, number] {
  const [[w, s], [e, n]] = geoBounds(g as never);
  const lon = w <= e ? (w + e) / 2 : (w + e + 360) / 2;
  return [lon > 180 ? lon - 360 : lon, (s + n) / 2];
}

/**
 * SVG path of a shape (silhouette §5.4 rules 5 to 7): azimuthal equal-area centered on the shape, north-up, fitted to a
 * square with 8% padding. Every shape is drawn at the same fitted size, so absolute size is not a clue.
 */
export function silhouettePath(g: GeoJSON.Geometry, size = VIEW): string {
  const [lon, lat] = center(g);
  const pad = size * PADDING;
  const projection = geoAzimuthalEqualArea()
    .rotate([-lon, -lat])
    .fitExtent(
      [
        [pad, pad],
        [size - pad, size - pad],
      ],
      g as never,
    );
  return geoPath(projection)(g as never) ?? "";
}
