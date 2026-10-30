import { geoEqualEarth, type GeoProjection } from "d3-geo";

/** World maps use Equal Earth: equal-area, so sizes are honest (ARCHITECTURE §6.2). Fitted to the viewport with a small margin. */
export function worldProjection(width: number, height: number, margin = 4): GeoProjection {
  return geoEqualEarth().fitExtent(
    [
      [margin, margin],
      [Math.max(margin + 1, width - margin), Math.max(margin + 1, height - margin)],
    ],
    { type: "Sphere" },
  );
}
