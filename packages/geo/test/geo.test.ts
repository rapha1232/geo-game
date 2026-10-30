import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EARTH_RADIUS_KM,
  distanceToAreaKm,
  haversineKm,
  pointInPolygon,
  proximityPercent,
  rhumbBearing,
  roundKm,
  sector8,
  type MultiPolygon,
  type Ring,
} from "../src/index";

const ll = (lat: number, lon: number) => ({ lat, lon });

describe("geo.golden.csv", () => {
  const rows = readFileSync(new URL("./geo.golden.csv", import.meta.url), "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => l.split(","));

  it("has at least 40 rows", () => expect(rows.length).toBeGreaterThanOrEqual(40));

  for (const [id, lat1, lon1, lat2, lon2, km, bearing, sector, prox] of rows) {
    it(`golden: ${id}`, () => {
      const a = ll(Number(lat1), Number(lon1));
      const b = ll(Number(lat2), Number(lon2));
      const same = a.lat === b.lat && a.lon === b.lon;
      const d = haversineKm(a, b);
      const br = same ? 0 : rhumbBearing(a, b);
      expect(roundKm(d)).toBe(Number(km));
      expect(br.toFixed(1)).toBe(bearing);
      expect(sector8(br)).toBe(sector);
      expect(proximityPercent(d, same)).toBe(Number(prox));
    });
  }
});

describe("silhouette distance, direction, proximity", () => {
  it("AC-SH-001 distance uses haversine between ref points, rounded to the nearest km", () => {
    expect(roundKm(haversineKm(ll(46.6, 2.5), ll(40.2, -3.6)))).toBe(865);
    expect(haversineKm(ll(0, 0), ll(0, 0))).toBe(0);
  });

  it("AC-SH-001 uses R = 6371.0088 km", () => {
    expect(EARTH_RADIUS_KM).toBe(6371.0088);
    expect(haversineKm(ll(0, 0), ll(0, 90))).toBeCloseTo((Math.PI / 2) * 6371.0088, 6);
  });

  it("AC-SH-002 direction is rhumb-line bucketed to 8 sectors", () => {
    const br = rhumbBearing(ll(46.6, 2.5), ll(40.2, -3.6));
    expect(br).toBeCloseTo(214.7, 1);
    expect(sector8(br)).toBe("SW");
  });

  it("AC-SH-002 sector boundaries are [lo, hi)", () => {
    const cases: [number, string][] = [
      [0, "N"],
      [22.4999, "N"],
      [22.5, "NE"],
      [67.4999, "NE"],
      [67.5, "E"],
      [112.5, "SE"],
      [157.5, "S"],
      [202.5, "SW"],
      [247.5, "W"],
      [292.5, "NW"],
      [337.4999, "NW"],
      [337.5, "N"],
      [359.999, "N"],
      [360, "N"],
      [-10, "N"],
    ];
    for (const [b, s] of cases) expect(sector8(b)).toBe(s);
  });

  it("AC-SH-003 antimeridian handled (Fiji → Samoa)", () => {
    const a = ll(-17.8, 178.0);
    const b = ll(-13.8, -172.1);
    const d = haversineKm(a, b);
    expect(roundKm(d)).toBe(1148);
    expect(rhumbBearing(a, b)).toBeCloseTo(67.2, 1);
    expect(sector8(rhumbBearing(a, b))).toBe("NE");
    expect(proximityPercent(d, false)).toBe(94);
    // Reverse direction crosses westward.
    expect(sector8(rhumbBearing(b, a))).toBe("SW");
  });

  it("AC-SH-004 proximity formula", () => {
    expect(proximityPercent(8651, false)).toBe(56);
    expect(proximityPercent(20015, false)).toBe(0);
    expect(proximityPercent(0, true)).toBe(100);
    expect(proximityPercent(0, false)).toBe(99); // wrong guess capped at 99
    expect(proximityPercent(25000, false)).toBe(0); // never negative
  });

  it("poles: bearing is finite and meridian-pure", () => {
    expect(rhumbBearing(ll(90, 0), ll(0, 0))).toBeCloseTo(180, 3);
    expect(rhumbBearing(ll(-90, 0), ll(0, 0))).toBeCloseTo(0, 3);
    expect(Number.isFinite(rhumbBearing(ll(90, 10), ll(-90, -170)))).toBe(true);
  });
});

const box = (w: number, s: number, e: number, n: number): Ring => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
  [w, s],
];

describe("point in polygon and distance to area", () => {
  it("AC-FP-002 inside the polygon scores distance 0", () => {
    const area: MultiPolygon = [[box(-10, -10, 0, 10)]];
    expect(distanceToAreaKm(ll(2, -5), area)).toBe(0);
  });

  it("AC-FP-002 holes are excluded and multipolygons use any polygon", () => {
    const donut = [box(0, 0, 10, 10), box(4, 4, 6, 6)];
    expect(pointInPolygon(ll(5, 5), donut)).toBe(false);
    expect(pointInPolygon(ll(2, 2), donut)).toBe(true);
    const mp: MultiPolygon = [[box(0, 0, 1, 1)], [box(20, 20, 21, 21)]];
    expect(distanceToAreaKm(ll(20.5, 20.5), mp)).toBe(0);
  });

  it("AC-FP-003 distance to the nearest boundary for an area target", () => {
    const area: MultiPolygon = [[box(-10, -10, 0, 10)]];
    // 500 km due east of the meridian edge, measured on the equator.
    const lon = ((500 / EARTH_RADIUS_KM) * 180) / Math.PI;
    expect(distanceToAreaKm(ll(0, lon), area)).toBeCloseTo(500, 3);
  });

  it("AC-FP-003 distance to a corner uses the vertex when the foot is off the arc", () => {
    const area: MultiPolygon = [[box(-10, -10, 0, 10)]];
    const d = distanceToAreaKm(ll(20, 5), area);
    expect(d).toBeCloseTo(haversineKm(ll(20, 5), ll(10, 0)), 0);
  });

  it("AC-FP-008 antimeridian geometry (Fiji-like polygon crossing ±180°)", () => {
    const fiji: MultiPolygon = [
      [box(177, -19.5, 180.5, -16)].map((r) =>
        r.map(([x, y]) => [x > 180 ? x - 360 : x, y] as [number, number]),
      ),
    ];
    expect(pointInPolygon(ll(-18.14, 178.44), fiji[0] as never)).toBe(true);
    expect(distanceToAreaKm(ll(-18.14, 178.44), fiji)).toBe(0);
    expect(pointInPolygon(ll(-18.14, -179.8), fiji[0] as never)).toBe(true);
    const outside = ll(-18.14, -179.0);
    expect(pointInPolygon(outside, fiji[0] as never)).toBe(false);
    const d = distanceToAreaKm(outside, fiji);
    expect(d).toBeGreaterThan(40);
    expect(d).toBeLessThan(300); // measured eastward across the antimeridian, not around the globe
  });

  it("degenerate input: zero-length segments and empty areas", () => {
    expect(
      distanceToAreaKm(ll(0, 0), [
        [
          [
            [1, 1],
            [1, 1],
            [1, 1],
          ],
        ],
      ]),
    ).toBeCloseTo(haversineKm(ll(0, 0), ll(1, 1)), 6);
    expect(pointInPolygon(ll(0, 0), [])).toBe(false);
  });
});
