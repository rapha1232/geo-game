declare module "polylabel" {
  /** `polygon` is GeoJSON-style rings of [x, y]. Returns the pole of inaccessibility as [x, y]. */
  export default function polylabel(
    polygon: number[][][],
    precision?: number,
    debug?: boolean,
  ): number[];
}
